/**
 * D07 §75 — StepExecutor
 * validate → permission → tool execute → normalize → persist → return
 * MUST NOT call Android directly — via ToolExecutor → D06
 */

import type { IStepExecutor, IToolExecutor } from "./interfaces/IStepExecutor";
import type { IPermissionGate } from "./interfaces/IPermissionGate";
import type { IVerificationManager } from "./interfaces/IVerificationManager";
import type { PlanStep, StepExecutionResult } from "./types/ExecutionStep";
import type { ExecutionContext } from "./types/ExecutionTypes";
import { Errors, normalizeError } from "./ExecutionError";
import { createJournalEntry } from "./ExecutionEvent";

export class StepExecutor implements IStepExecutor {
  constructor(
    private toolExecutor: IToolExecutor,
    private permissionGate: IPermissionGate,
    private verifier?: IVerificationManager,
    private repository?: {
      appendJournal: (entry: import("./ExecutionEvent").ExecutionJournalEntry) => Promise<void>;
    }
  ) {}

  async execute(step: PlanStep, context: ExecutionContext): Promise<StepExecutionResult> {
    const start = Date.now();
    const attempt = 0; // Will be incremented by ExecutionEngine

    // 1. Validate step input (defense-in-depth D07 §54, D03 schema already validated in PlanValidator)
    if (!step.toolId || !step.input) {
      return {
        stepId: step.stepId,
        status: "FAILED",
        error: Errors.invalidPlan(`Step ${step.stepId} missing toolId/input`),
        attempt,
        durationMs: Date.now() - start,
      };
    }

    // 2. Permission Gate — BEFORE every side effect D07 §29
    const decision = await this.permissionGate.evaluate(
      {
        toolId: step.toolId,
        permissionLevel: step.permissionLevel,
        input: step.input,
        stepId: step.stepId,
      },
      context
    );

    if (!decision.allowed) {
      if (decision.requiresUserConfirmation) {
        // Will be handled by ExecutionEngine as WAITING_USER
        return {
          stepId: step.stepId,
          status: "WAITING",
          error: {
            code: "USER_CONFIRMATION_REQUIRED",
            category: "PERMISSION_ERROR",
            retryable: false,
            recoverable: true,
            userActionRequired: true,
            message: decision.reason,
          },
          attempt,
          durationMs: Date.now() - start,
        };
      }
      return {
        stepId: step.stepId,
        status: "FAILED",
        error: {
          code: "PERMISSION_DENIED",
          category: "PERMISSION_ERROR",
          retryable: false,
          recoverable: false,
          userActionRequired: true,
          message: decision.reason,
        },
        attempt,
        durationMs: Date.now() - start,
      };
    }

    // 3. Journal: ACTION_STARTED
    if (this.repository) {
      await this.repository.appendJournal(
        createJournalEntry({
          executionId: context.executionId,
          stepId: step.stepId,
          eventType: "ACTION_STARTED",
          actor: context.actor.userId,
          correlationId: context.metadata.correlationId,
          safeMetadata: { toolId: step.toolId },
        })
      );
    }

    // 4. Tool execution via D03 ToolExecutor — only authorized path
    // Apply timeout D07 §33
    const timeoutMs = step.timeout?.timeoutMs ?? 15000;
    let toolResult: import("./types/ExecutionResult").ToolResult;
    try {
      toolResult = await this.withTimeout(
        this.toolExecutor.execute(step.toolId, step.input, context),
        timeoutMs,
        step.stepId
      );
    } catch (e) {
      const normalized = normalizeError(e);
      // Handle timeout specially
      if (normalized.code === "EXEC_TIMEOUT") {
        normalized.retryable = step.retryPolicy ? true : false;
      }
      toolResult = {
        success: false,
        status: normalized.code === "EXEC_TIMEOUT" ? "TIMEOUT" : "FAILED",
        error: normalized,
        metadata: {
          toolId: step.toolId,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 5. Journal: ACTION_COMPLETED
    if (this.repository) {
      await this.repository.appendJournal(
        createJournalEntry({
          executionId: context.executionId,
          stepId: step.stepId,
          eventType: "ACTION_COMPLETED",
          actor: context.actor.userId,
          correlationId: context.metadata.correlationId,
          safeMetadata: { toolId: step.toolId, success: toolResult.success, status: toolResult.status },
        })
      );
    }

    // 6. Verification D07 §22-24 — distinguish accepted vs verified
    if (toolResult.success && this.verifier && step.verification) {
      const verification = await this.verifier.verify(context, step, toolResult);
      if (!verification.success) {
        return {
          stepId: step.stepId,
          status: "FAILED",
          error: {
            code: "VERIFICATION_FAILED",
            category: "VERIFICATION_ERROR",
            retryable: false,
            recoverable: true,
            userActionRequired: false,
            message: verification.reason,
            details: { evidence: verification.evidence },
          },
          attempt,
          durationMs: Date.now() - start,
          verification,
        };
      }
      return {
        stepId: step.stepId,
        status: "SUCCESS",
        result: toolResult.data,
        attempt,
        durationMs: Date.now() - start,
        verification,
      };
    }

    // 7. Return result
    if (toolResult.success) {
      return {
        stepId: step.stepId,
        status: "SUCCESS",
        result: toolResult.data,
        attempt,
        durationMs: Date.now() - start,
      };
    } else {
      return {
        stepId: step.stepId,
        status: "FAILED",
        error: toolResult.error,
        attempt,
        durationMs: Date.now() - start,
      };
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, stepId: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(`Step ${stepId} timed out after ${ms}ms`)
        );
        // Mark as timeout error for normalization
        (Error as unknown as Record<string, unknown>)["code"] = "EXEC_TIMEOUT";
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (e) {
      clearTimeout(timeoutId!);
      if (e instanceof Error && e.message.includes("timed out")) {
        throw {
          code: "EXEC_TIMEOUT",
          category: "TIMEOUT_ERROR",
          retryable: true,
          recoverable: true,
          userActionRequired: false,
          message: e.message,
        };
      }
      throw e;
    }
  }
}
