/**
 * D07 §40-41 — RecoveryManager
 * Deterministic recovery, fail-closed
 */

export type RecoveryStrategy = "RETRY" | "REVERIFY" | "WAIT" | "ASK_USER" | "SKIP" | "ABORT" | "REPLAN";

export interface RecoveryDecision {
  strategy: RecoveryStrategy;
  reason: string;
  safe: boolean;
  retryDelayMs?: number;
}

export interface ExecutionFailure {
  executionId: string;
  stepId?: string;
  error: import("../types/ExecutionResult").ExecutionError;
  attempt: number;
  actionStatus?: "IN_FLIGHT" | "COMPLETED" | "UNKNOWN";
}

export interface IRecoveryManager {
  /**
   * Decide recovery deterministically
   * If safety cannot be proven: safe=false → ABORT / ASK_USER
   */
  recover(failure: ExecutionFailure): Promise<RecoveryDecision>;
}

export interface IRetryPolicyEvaluator {
  shouldRetry(failure: ExecutionFailure, retryPolicy?: import("../types/ExecutionStep").RetryPolicy): boolean;
  getBackoffMs(attempt: number, policy: import("../types/ExecutionStep").RetryPolicy): number;
}
