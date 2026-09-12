/**
 * D07 §42-45 — Normalized Errors
 * D06 §12 — NativeErrorCode mapping
 * Raw exceptions MUST NOT reach LLM — always normalized
 */

import type { ExecutionError, ExecutionErrorCode, ErrorCategory } from "./types/ExecutionResult";

export class ExecutionException extends Error implements ExecutionError {
  code: ExecutionErrorCode;
  category: ErrorCategory;
  retryable: boolean;
  recoverable: boolean;
  userActionRequired: boolean;
  details?: Record<string, unknown>;

  constructor(error: ExecutionError) {
    super(error.message);
    this.name = "ExecutionException";
    this.code = error.code;
    this.category = error.category;
    this.retryable = error.retryable;
    this.recoverable = error.recoverable;
    this.userActionRequired = error.userActionRequired;
    this.details = error.details;
  }

  toSafeError(): ExecutionError {
    return {
      code: this.code,
      category: this.category,
      retryable: this.retryable,
      recoverable: this.recoverable,
      userActionRequired: this.userActionRequired,
      message: this.message,
      details: this.details,
    };
  }
}

// Factory helpers — fail-closed by default D07 §30
export const Errors = {
  invalidPlan: (msg: string): ExecutionError => ({
    code: "EXEC_INVALID_PLAN",
    category: "VALIDATION_ERROR",
    retryable: false,
    recoverable: false,
    userActionRequired: false,
    message: msg,
  }),

  toolNotFound: (toolId: string): ExecutionError => ({
    code: "TOOL_NOT_FOUND",
    category: "TOOL_ERROR",
    retryable: false,
    recoverable: false,
    userActionRequired: false,
    message: `Tool not found: ${toolId}`,
    details: { toolId },
  }),

  capabilityNotFound: (capabilityId: string): ExecutionError => ({
    code: "CAPABILITY_NOT_FOUND",
    category: "CAPABILITY_ERROR",
    retryable: false,
    recoverable: false,
    userActionRequired: false,
    message: `Capability not found: ${capabilityId}`,
  }),

  permissionDenied: (reason: string): ExecutionError => ({
    code: "PERMISSION_DENIED",
    category: "PERMISSION_ERROR",
    retryable: false,
    recoverable: false,
    userActionRequired: true,
    message: `Permission denied: ${reason}`,
  }),

  permissionUnknown: (): ExecutionError => ({
    code: "PERMISSION_UNKNOWN",
    category: "PERMISSION_ERROR",
    retryable: false,
    recoverable: false,
    userActionRequired: false,
    message: "Permission status unknown — denying by default (fail-closed)",
  }),

  timeout: (stepId: string, ms: number): ExecutionError => ({
    code: "EXEC_TIMEOUT",
    category: "TIMEOUT_ERROR",
    retryable: true,
    recoverable: true,
    userActionRequired: false,
    message: `Step ${stepId} timed out after ${ms}ms`,
    details: { stepId, timeoutMs: ms },
  }),

  verificationFailed: (reason: string): ExecutionError => ({
    code: "VERIFICATION_FAILED",
    category: "VERIFICATION_ERROR",
    retryable: false,
    recoverable: true,
    userActionRequired: false,
    message: `Verification failed: ${reason}`,
  }),

  securityViolation: (reason: string): ExecutionError => ({
    code: "SECURITY_POLICY_VIOLATION",
    category: "SECURITY_ERROR",
    retryable: false,
    recoverable: false,
    userActionRequired: false,
    message: `Security violation: ${reason}`,
  }),

  unknownOutcome: (stepId: string): ExecutionError => ({
    code: "UNKNOWN_FAILURE",
    category: "UNKNOWN_ERROR",
    retryable: false,
    recoverable: true,
    userActionRequired: false,
    message: `Unknown outcome for step ${stepId} — process may have died after side effect`,
    details: { stepId },
  }),

  persistenceFailed: (reason: string): ExecutionError => ({
    code: "PERSISTENCE_FAILED",
    category: "PERSISTENCE_ERROR",
    retryable: true,
    recoverable: true,
    userActionRequired: false,
    message: `Persistence failed: ${reason}`,
  }),
};

// D07 §138 — Never automatically retry these
export const NON_RETRYABLE_CODES: ReadonlySet<ExecutionErrorCode> = new Set([
  "SECURITY_POLICY_VIOLATION",
  "PERMISSION_DENIED",
  "PERMISSION_UNKNOWN",
  "TOOL_NOT_FOUND",
  "CAPABILITY_NOT_FOUND",
  "EXEC_INVALID_PLAN",
  "USER_CANCELLED",
]);

export function isRetryable(error: ExecutionError): boolean {
  if (NON_RETRYABLE_CODES.has(error.code)) return false;
  return error.retryable;
}

// D07 §45 — Normalize raw error to safe error (strip internals)
export function normalizeError(raw: unknown): ExecutionError {
  if (raw instanceof ExecutionException) return raw.toSafeError();
  if (typeof raw === "object" && raw !== null && "code" in raw) {
    return raw as ExecutionError;
  }
  const message = raw instanceof Error ? raw.message : String(raw);
  // Strip stack traces, paths, credentials
  return {
    code: "UNKNOWN_FAILURE",
    category: "UNKNOWN_ERROR",
    retryable: false,
    recoverable: false,
    userActionRequired: false,
    message: message.slice(0, 500), // bounded
  };
}
