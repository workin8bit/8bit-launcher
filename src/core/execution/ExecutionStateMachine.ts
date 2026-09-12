/**
 * D07 §10-12, §98, §161 — Deterministic State Machine
 * Every transition MUST: validate, persist, journal, audit
 * No direct mutation
 */

import {
  type ExecutionState,
  type TransitionReason,
  isValidTransition,
  isTerminal,
} from "./types/ExecutionState";
import { Errors, ExecutionException } from "./ExecutionError";
import { createJournalEntry } from "./ExecutionEvent";
import type { Execution } from "./types/ExecutionTypes";

export interface IExecutionStateMachine {
  transition(
    execution: Execution,
    target: ExecutionState,
    reason: TransitionReason
  ): Promise<Execution>;
  canTransition(from: ExecutionState, to: ExecutionState): boolean;
}

export class ExecutionStateMachine implements IExecutionStateMachine {
  constructor(
    private repository: {
      update: (execution: Execution) => Promise<void>;
      appendJournal: (entry: import("./ExecutionEvent").ExecutionJournalEntry) => Promise<void>;
    },
    private auditEmitter?: {
      emit: (event: import("./ExecutionEvent").AuditEvent) => Promise<void>;
    }
  ) {}

  canTransition(from: ExecutionState, to: ExecutionState): boolean {
    return isValidTransition(from, to);
  }

  async transition(
    execution: Execution,
    target: ExecutionState,
    reason: TransitionReason
  ): Promise<Execution> {
    // 1. validate current state
    if (isTerminal(execution.state)) {
      throw new ExecutionException({
        code: "EXEC_INVALID_STATE",
        category: "VALIDATION_ERROR",
        retryable: false,
        recoverable: false,
        userActionRequired: false,
        message: `Cannot transition from terminal state ${execution.state} to ${target}`,
        details: { executionId: execution.executionId, from: execution.state, to: target },
      });
    }

    // 2. validate target state
    if (!isValidTransition(execution.state, target)) {
      throw new ExecutionException({
        code: "EXEC_INVALID_STATE",
        category: "VALIDATION_ERROR",
        retryable: false,
        recoverable: false,
        userActionRequired: false,
        message: `Invalid transition ${execution.state} → ${target} (reason: ${reason})`,
        details: { executionId: execution.executionId, from: execution.state, to: target, reason },
      });
    }

    // 3. validate reason (must be non-empty)
    if (!reason) {
      throw new ExecutionException(Errors.invalidPlan("Transition reason required"));
    }

    const stateBefore = execution.state;
    const updated: Execution = {
      ...execution,
      state: target,
      updatedAt: new Date().toISOString(),
      completedAt: isTerminal(target) ? new Date().toISOString() : execution.completedAt,
    };

    // 4. persist transition (atomic with journal — caller should use transaction if available)
    // D07 §98 Atomicity: state update + journal append should be transactional
    await this.repository.update(updated);

    // 5. append journal event
    const journalEntry = createJournalEntry({
      executionId: execution.executionId,
      eventType: "STATE_TRANSITION",
      actor: execution.context.actor.userId,
      correlationId: execution.context.metadata.correlationId,
      stateBefore,
      stateAfter: target,
      safeMetadata: { reason, target },
    });
    await this.repository.appendJournal(journalEntry);

    // 6. emit audit where required (sensitive transitions)
    if (this.auditEmitter && ["DENIED", "FAILED", "ABORTED"].includes(target)) {
      await this.auditEmitter.emit({
        eventId: `audit_${Date.now()}`,
        executionId: execution.executionId,
        actor: execution.context.actor.userId,
        action: `state_transition:${stateBefore}->${target}`,
        authority: "ExecutionStateMachine",
        timestamp: new Date().toISOString(),
        result: target === "DENIED" ? "denied" : "failed",
        reason,
      });
    }

    return updated;
  }
}
