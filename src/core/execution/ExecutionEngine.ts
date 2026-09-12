/**
 * D07 — ExecutionEngine (Orchestrator)
 * D07 §74, §151-154 — Contract first, no God Object, DI
 * THINK → ACT → VERIFY → RECOVER loop
 */

import type { IExecutionEngine } from "./interfaces/IExecutionEngine";
import type { Execution, ExecutionContext, StructuredPlan, ExecutionStatus } from "./types/ExecutionTypes";
import type { ExecutionResult } from "./types/ExecutionResult";
import { ExecutionStateMachine } from "./ExecutionStateMachine";
import { createJournalEntry } from "./ExecutionEvent";
import { Errors, normalizeError, isRetryable } from "./ExecutionError";
import { isTerminal } from "./types/ExecutionState";

// Dependencies injected (D07 §154)
export interface ExecutionDependencies {
  repository: {
    create: (execution: Execution) => Promise<void>;
    get: (executionId: string) => Promise<Execution | null>;
    update: (execution: Execution) => Promise<void>;
    appendJournal: (entry: import("./ExecutionEvent").ExecutionJournalEntry) => Promise<void>;
  };
  stateMachine: ExecutionStateMachine;
  stepExecutor: import("./interfaces/IStepExecutor").IStepExecutor;
  verifier: import("./interfaces/IVerificationManager").IVerificationManager;
  recoveryManager: import("./interfaces/IRecoveryManager").IRecoveryManager;
  clock: { now: () => string };
  idGenerator?: () => string;
}

export class ExecutionEngine implements IExecutionEngine {
  constructor(private deps: ExecutionDependencies) {}

  async start(plan: StructuredPlan, context: ExecutionContext): Promise<ExecutionResult> {
    // 1. Plan Validation D07 §16 — fail-closed
    const validation = this.validatePlan(plan);
    if (!validation.valid) {
      throw new Error(`Invalid plan: ${validation.reason}`);
    }

    // 2. Create Execution with durable state BEFORE any side effect D07 §50-51, §131
    const executionId = this.deps.idGenerator ? this.deps.idGenerator() : `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const execution: Execution = {
      executionId,
      planId: plan.planId,
      planVersion: plan.version,
      plan,
      context: { ...context, executionId },
      state: "CREATED",
      completedSteps: [],
      pendingSteps: plan.steps.map(s => s.stepId),
      variables: {},
      attemptCounters: {},
      retryState: {},
      createdAt: this.deps.clock.now(),
      updatedAt: this.deps.clock.now(),
      executionSchemaVersion: "1.0",
    };

    await this.deps.repository.create(execution);
    await this.deps.repository.appendJournal(
      createJournalEntry({
        executionId,
        eventType: "EXECUTION_CREATED",
        actor: context.actor.userId,
        correlationId: context.metadata.correlationId,
        safeMetadata: { planId: plan.planId, totalSteps: plan.steps.length },
      })
    );

    // 3. State: CREATED → VALIDATING → READY → RUNNING
    let current = await this.deps.stateMachine.transition(execution, "VALIDATING", "PLAN_VALIDATED");
    current = await this.deps.stateMachine.transition(current, "READY", "PLAN_VALIDATED");
    current = await this.deps.stateMachine.transition(current, "RUNNING", "STEP_SUCCESS");

    // 4. THINK → ACT → VERIFY → RECOVER loop D07 §19, §189
    return this.runLoop(current);
  }

  async resume(executionId: string): Promise<ExecutionResult> {
    const execution = await this.deps.repository.get(executionId);
    if (!execution) throw new Error(`Execution not found: ${executionId}`);

    // D07 §55-56 Resume Rule — revalidate
    const validation = this.validatePlan(execution.plan);
    if (!validation.valid) {
      const failed = await this.deps.stateMachine.transition(execution, "FAILED", "PLAN_INVALID");
      return this.toResult(failed, "FAILED", Errors.invalidPlan(validation.reason!));
    }

    // Check for UNKNOWN_OUTCOME / IN_FLIGHT D07 §38-39, §132
    if (execution.actionStatus === "IN_FLIGHT") {
      // Must verify external state before blind retry — handled in runLoop recovery
      execution.state = "RECOVERING" as const;
    }

    return this.runLoop(execution);
  }

  async cancel(executionId: string): Promise<void> {
    const execution = await this.deps.repository.get(executionId);
    if (!execution) return;
    if (isTerminal(execution.state as import("./types/ExecutionState").ExecutionState)) return;

    // D07 §34 Cancellation: STOP_NEW_ACTIONS → PERSIST → CANCELLED
    await this.deps.stateMachine.transition(execution, "CANCELLED", "CANCEL_REQUESTED");
    await this.deps.repository.appendJournal(
      createJournalEntry({
        executionId,
        eventType: "EXECUTION_CANCELLED",
        actor: execution.context.actor.userId,
        correlationId: execution.context.metadata.correlationId,
      })
    );
  }

  async status(executionId: string): Promise<ExecutionStatus> {
    const execution = await this.deps.repository.get(executionId);
    if (!execution) throw new Error(`Execution not found: ${executionId}`);
    return {
      executionId: execution.executionId,
      state: execution.state as import("./types/ExecutionState").ExecutionState,
      currentStepId: execution.currentStepId,
      completedStepCount: execution.completedSteps.length,
      totalStepCount: execution.plan.steps.length,
      retryCount: Object.values(execution.retryState).reduce((a, b) => a + b, 0),
      recoveryCount: 0, // TODO: track
      startedAt: execution.startedAt,
      updatedAt: execution.updatedAt,
    };
  }

  async getExecution(executionId: string): Promise<Execution | null> {
    return this.deps.repository.get(executionId);
  }

  // ──────────────────────────────────────────────
  // Core Loop — THINK → ACT → VERIFY → RECOVER D07 §189
  // ──────────────────────────────────────────────
  private async runLoop(execution: Execution): Promise<ExecutionResult> {
    let current = execution;
    current.startedAt = current.startedAt ?? this.deps.clock.now();

    // Resolve dependency graph — sequential MVP D07 §66, §148
    const stepMap = new Map(current.plan.steps.map(s => [s.stepId, s]));

    for (const step of current.plan.steps) {
      // Check cancellation
      const fresh = await this.deps.repository.get(current.executionId);
      if (fresh && isTerminal(fresh.state as import("./types/ExecutionState").ExecutionState)) {
        return this.toResult(fresh, fresh.state as import("./types/ExecutionResult").ExecutionFinalStatus);
      }

      // THINK: resolve next step — dependency check D07 §18, §20
      const depsReady = this.areDependenciesMet(step, current.completedSteps);
      if (!depsReady) {
        // Skip if policy allows, else fail
        if (current.plan.failurePolicy?.onStepFailure === "SKIP") {
          await this.deps.repository.appendJournal(
            createJournalEntry({
              executionId: current.executionId,
              stepId: step.stepId,
              eventType: "ACTION_COMPLETED",
              actor: current.context.actor.userId,
              correlationId: current.context.metadata.correlationId,
              safeMetadata: { skipped: true, reason: "dependencies not met" },
            })
          );
          continue;
        }
        const error = Errors.invalidPlan(`Dependencies not met for ${step.stepId}`);
        return this.fail(current, error, step.stepId);
      }

      current.currentStepId = step.stepId;
      await this.deps.repository.update(current);

      // ACT: execute step via StepExecutor (permission gate inside)
      // D07 §131 Crash Consistency: PERSIST INTENT → EXECUTE → PERSIST RESULT
      current.actionStatus = "IN_FLIGHT";
      await this.deps.repository.update(current);

      const stepResult = await this.deps.stepExecutor.execute(step, current.context);

      current.actionStatus = "COMPLETED";

      // Handle WAITING_USER (confirmation required)
      if (stepResult.status === "WAITING") {
        current = await this.deps.stateMachine.transition(current, "WAITING_USER", "USER_CONFIRMATION_REQUIRED");
        // Persist and return — will resume after user confirmation
        await this.deps.repository.appendJournal(
          createJournalEntry({
            executionId: current.executionId,
            stepId: step.stepId,
            eventType: "USER_CONFIRMATION_REQUESTED",
            actor: current.context.actor.userId,
            correlationId: current.context.metadata.correlationId,
          })
        );
        return this.toResult(current, "DENIED", stepResult.error);
      }

      // VERIFY is already done inside StepExecutor via VerificationManager
      if (stepResult.status === "SUCCESS") {
        current.completedSteps.push(step.stepId);
        current.pendingSteps = current.pendingSteps.filter(id => id !== step.stepId);
        current.variables[step.stepId] = stepResult.result;
        await this.deps.repository.update(current);

        await this.deps.repository.appendJournal(
          createJournalEntry({
            executionId: current.executionId,
            stepId: step.stepId,
            eventType: "VERIFICATION_COMPLETED",
            actor: current.context.actor.userId,
            correlationId: current.context.metadata.correlationId,
            safeMetadata: { success: true },
          })
        );
        continue; // NEXT step
      }

      // FAILURE → RECOVER D07 §40-41
      const failure = {
        executionId: current.executionId,
        stepId: step.stepId,
        error: stepResult.error!,
        attempt: current.attemptCounters[step.stepId] ?? 0,
        actionStatus: current.actionStatus,
      };

      const decision = await this.deps.recoveryManager.recover(failure);

      if (decision.strategy === "RETRY" && decision.safe) {
        // Check retry policy
        const policy = step.retryPolicy ?? { maxAttempts: 0, backoff: "NONE" as const };
        const currentAttempts = current.attemptCounters[step.stepId] ?? 0;
        if (currentAttempts < policy.maxAttempts && isRetryable(stepResult.error!)) {
          current.attemptCounters[step.stepId] = currentAttempts + 1;
          await this.deps.repository.update(current);
          await this.deps.repository.appendJournal(
            createJournalEntry({
              executionId: current.executionId,
              stepId: step.stepId,
              eventType: "RETRY_STARTED",
              actor: current.context.actor.userId,
              correlationId: current.context.metadata.correlationId,
              safeMetadata: { attempt: currentAttempts + 1, reason: decision.reason },
            })
          );
          // Simple retry: re-execute same step (with backoff)
          if (decision.retryDelayMs) await this.delay(decision.retryDelayMs);
          const retryResult = await this.deps.stepExecutor.execute(step, current.context);
          if (retryResult.status === "SUCCESS") {
            current.completedSteps.push(step.stepId);
            current.pendingSteps = current.pendingSteps.filter(id => id !== step.stepId);
            await this.deps.repository.update(current);
            continue;
          }
        }
      }

      if (decision.strategy === "REVERIFY" || decision.strategy === "RETRY") {
        // Unknown outcome — must verify external state before retry D07 §38
        return this.fail(current, stepResult.error!, step.stepId);
      }

      if (decision.strategy === "ASK_USER") {
        current = await this.deps.stateMachine.transition(current, "WAITING_USER", "USER_CONFIRMATION_REQUIRED");
        return this.toResult(current, "DENIED", stepResult.error);
      }

      // ABORT / FAIL
      return this.fail(current, stepResult.error!, step.stepId);
    }

    // All steps completed → VERIFYING → COMPLETED D07 §107 No False Success
    current = await this.deps.stateMachine.transition(current, "VERIFYING", "STEP_SUCCESS");
    // Final plan verification
    const planVerification = await this.deps.verifier.verifyPlan(
      current.context,
      current.plan,
      current.completedSteps.map(id => ({ success: true } as import("./types/ExecutionResult").ToolResult))
    );
    if (!planVerification.success) {
      return this.fail(current, Errors.verificationFailed(planVerification.reason));
    }

    current = await this.deps.stateMachine.transition(current, "COMPLETED", "VERIFICATION_PASSED");
    await this.deps.repository.appendJournal(
      createJournalEntry({
        executionId: current.executionId,
        eventType: "EXECUTION_COMPLETED",
        actor: current.context.actor.userId,
        correlationId: current.context.metadata.correlationId,
        safeMetadata: { completedSteps: current.completedSteps.length },
      })
    );

    return this.toResult(current, "COMPLETED");
  }

  private validatePlan(plan: StructuredPlan): { valid: boolean; reason?: string } {
    if (!plan.planId || !plan.steps || plan.steps.length === 0) {
      return { valid: false, reason: "Plan must have planId and at least one step" };
    }
    if (plan.steps.length > 8) {
      // D04 maxSteps, D07 §64 maxStepCount
      return { valid: false, reason: "Too many steps (max 8 for MVP)" };
    }
    // Check unique stepIds
    const ids = plan.steps.map(s => s.stepId);
    if (new Set(ids).size !== ids.length) {
      return { valid: false, reason: "Duplicate stepId" };
    }
    // Check dependency DAG — no cycles D07 §17
    if (this.hasCycle(plan.steps)) {
      return { valid: false, reason: "Cyclic dependency detected" };
    }
    // Check toolId exists — would check via registry in real impl
    for (const s of plan.steps) {
      if (!s.toolId) return { valid: false, reason: `Step ${s.stepId} missing toolId` };
      if (s.permissionLevel < 0 || s.permissionLevel > 4) return { valid: false, reason: `Step ${s.stepId} invalid permissionLevel` };
    }
    return { valid: true };
  }

  private hasCycle(steps: import("./types/ExecutionStep").PlanStep[]): boolean {
    const graph = new Map<string, string[]>();
    for (const s of steps) graph.set(s.stepId, s.dependencyIds ?? []);
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      recStack.add(node);
      for (const dep of graph.get(node) ?? []) {
        if (dfs(dep)) return true;
      }
      recStack.delete(node);
      return false;
    };

    for (const s of steps) if (dfs(s.stepId)) return true;
    return false;
  }

  private areDependenciesMet(step: import("./types/ExecutionStep").PlanStep, completed: string[]): boolean {
    if (!step.dependencyIds || step.dependencyIds.length === 0) return true;
    return step.dependencyIds.every(dep => completed.includes(dep));
  }

  private async fail(execution: Execution, error: import("./types/ExecutionResult").ExecutionError, failedStepId?: string): Promise<ExecutionResult> {
    const failed = await this.deps.stateMachine.transition(execution, "FAILED", "STEP_FAILED");
    await this.deps.repository.appendJournal(
      createJournalEntry({
        executionId: execution.executionId,
        stepId: failedStepId,
        eventType: "EXECUTION_FAILED",
        actor: execution.context.actor.userId,
        correlationId: execution.context.metadata.correlationId,
        safeMetadata: { errorCode: error.code, failedStepId },
      })
    );
    return this.toResult(failed, "FAILED", error, failedStepId);
  }

  private toResult(
    execution: Execution,
    status: import("./types/ExecutionResult").ExecutionFinalStatus,
    error?: import("./types/ExecutionResult").ExecutionError,
    failedStepId?: string
  ): ExecutionResult {
    return {
      executionId: execution.executionId,
      status,
      completedSteps: execution.completedSteps,
      failedStepId,
      error,
      verification: {
        totalSteps: execution.plan.steps.length,
        verifiedSteps: execution.completedSteps.length,
        failedSteps: failedStepId ? [failedStepId] : [],
        overallSuccess: status === "COMPLETED",
      },
      durationMs: execution.startedAt ? Date.now() - new Date(execution.startedAt).getTime() : 0,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
