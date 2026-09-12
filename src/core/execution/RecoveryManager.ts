/**
 * D07 §40-41, §77, §138 — Recovery Manager
 * Deterministic, fail-closed, bounded
 */

import type { IRecoveryManager, RecoveryDecision, ExecutionFailure } from "./interfaces/IRecoveryManager";
import { isRetryable } from "./ExecutionError";

export class RecoveryManager implements IRecoveryManager {
  async recover(failure: ExecutionFailure): Promise<RecoveryDecision> {
    const { error, attempt, actionStatus } = failure;

    // D07 §138 — Never automatically retry these
    if (["SECURITY_POLICY_VIOLATION", "PERMISSION_DENIED", "USER_CANCELLED", "TOOL_NOT_FOUND", "CAPABILITY_NOT_FOUND", "EXEC_INVALID_PLAN"].includes(error.code)) {
      return {
        strategy: "ABORT",
        reason: `Non-retryable error: ${error.code} — aborting`,
        safe: false,
      };
    }

    // D07 §39 UNKNOWN_OUTCOME → REVERIFY before retry
    if (actionStatus === "UNKNOWN" || error.code === "UNKNOWN_FAILURE") {
      return {
        strategy: "REVERIFY",
        reason: "Unknown outcome — must verify external state before retry (D07 §38)",
        safe: true,
      };
    }

    // D07 §77 Recovery Policy
    switch (error.code) {
      case "NETWORK_UNAVAILABLE":
        return { strategy: "WAIT", reason: "Network unavailable — waiting", safe: true };
      case "EXEC_TIMEOUT":
        if (isRetryable(error) && attempt < 2) {
          return { strategy: "RETRY", reason: `Timeout retryable — attempt ${attempt + 1}`, safe: true, retryDelayMs: this.getBackoffMs(attempt) };
        }
        return { strategy: "ABORT", reason: "Timeout — max retries exceeded", safe: false };
      case "PERMISSION_DENIED":
        return { strategy: "ASK_USER", reason: "Permission denied — ask user", safe: true };
      case "FILE_ACCESS_DENIED":
        return { strategy: "ABORT", reason: "File access denied — abort", safe: false };
      case "VERIFICATION_FAILED":
        if (attempt < 1) {
          return { strategy: "RETRY", reason: "Verification failed — retry once", safe: true, retryDelayMs: 1000 };
        }
        return { strategy: "REPLAN", reason: "Verification failed after retry — replan required", safe: true };
      case "TOOL_EXECUTION_FAILED":
        if (isRetryable(error) && attempt < 2) {
          return { strategy: "RETRY", reason: `Tool execution failed retryable — retry ${attempt + 1}`, safe: true, retryDelayMs: this.getBackoffMs(attempt) };
        }
        return { strategy: "ABORT", reason: "Tool execution failed — abort", safe: false };
      default:
        if (isRetryable(error) && attempt < 2) {
          return { strategy: "RETRY", reason: `Retryable error ${error.code} — attempt ${attempt + 1}`, safe: true, retryDelayMs: this.getBackoffMs(attempt) };
        }
        return { strategy: "ABORT", reason: `Non-retryable or max retries: ${error.code}`, safe: false };
    }
  }

  private getBackoffMs(attempt: number): number {
    // Exponential backoff: 1s, 3s, 9s
    return Math.min(1000 * Math.pow(3, attempt), 10000);
  }
}

// Retry policy evaluator — standalone for StepExecutor
export function shouldRetry(failure: ExecutionFailure, retryPolicy?: import("./types/ExecutionStep").RetryPolicy): boolean {
  if (!retryPolicy) return false;
  if (failure.attempt >= retryPolicy.maxAttempts) return false;
  if (!isRetryable(failure.error)) return false;
  if (retryPolicy.retryableErrors && !retryPolicy.retryableErrors.includes(failure.error.code)) return false;
  // D07 §36 — side-effecting retry only if safe
  // For scaffolding, assume policy already validated idempotency
  return true;
}

export function getBackoffMs(attempt: number, policy: import("./types/ExecutionStep").RetryPolicy): number {
  switch (policy.backoff) {
    case "NONE": return 0;
    case "LINEAR": return 1000 * (attempt + 1);
    case "EXPONENTIAL": return Math.min(1000 * Math.pow(2, attempt), 10000);
    default: return 1000;
  }
}
