/**
 * D07 §42-45, §60, §106 — Normalized Errors & Results
 * D00 Bab 17 — Error Handling (SUCCESS/PARTIAL/FAILED/BLOCKED)
 */

export type ErrorCategory =
  | "VALIDATION_ERROR"
  | "PERMISSION_ERROR"
  | "USER_ERROR"
  | "TOOL_ERROR"
  | "CAPABILITY_ERROR"
  | "ANDROID_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR"
  | "LIFECYCLE_ERROR"
  | "PERSISTENCE_ERROR"
  | "VERIFICATION_ERROR"
  | "SECURITY_ERROR"
  | "UNKNOWN_ERROR";

export type ExecutionErrorCode =
  | "EXEC_INVALID_PLAN"
  | "EXEC_INVALID_STATE"
  | "EXEC_TIMEOUT"
  | "EXEC_CANCELLED"
  | "EXEC_DUPLICATE"
  | "EXEC_RECOVERY_FAILED"
  | "TOOL_NOT_FOUND"
  | "TOOL_INVALID_INPUT"
  | "TOOL_EXECUTION_FAILED"
  | "PERMISSION_DENIED"
  | "PERMISSION_UNKNOWN"
  | "USER_CONFIRMATION_REQUIRED"
  | "USER_CANCELLED"
  | "CAPABILITY_NOT_FOUND"
  | "CAPABILITY_DENIED"
  | "ANDROID_OPERATION_FAILED"
  | "ANDROID_LIFECYCLE_INTERRUPTED"
  | "NETWORK_UNAVAILABLE"
  | "FILE_ACCESS_DENIED"
  | "VERIFICATION_FAILED"
  | "PERSISTENCE_FAILED"
  | "SECURITY_POLICY_VIOLATION"
  | "VARIABLE_RESOLUTION_FAILED"
  | "UNKNOWN_FAILURE";

export interface ExecutionError {
  code: ExecutionErrorCode;
  category: ErrorCategory;
  retryable: boolean;
  recoverable: boolean;
  userActionRequired: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface VerificationResult {
  success: boolean;
  evidence?: unknown;
  reason: string;
  confidence?: number;
}

export interface VerificationSummary {
  totalSteps: number;
  verifiedSteps: number;
  failedSteps: string[];
  overallSuccess: boolean;
}

export type ExecutionFinalStatus = "COMPLETED" | "FAILED" | "CANCELLED" | "DENIED" | "ABORTED";

export interface ExecutionResult {
  executionId: string;
  status: ExecutionFinalStatus;
  completedSteps: string[];
  failedStepId?: string;
  output?: unknown;
  error?: ExecutionError;
  verification: VerificationSummary;
  durationMs: number;
}

export interface ToolResult {
  success: boolean;
  status: "SUCCESS" | "FAILED" | "CANCELLED" | "TIMEOUT" | "DENIED" | "UNKNOWN";
  data?: unknown;
  error?: ExecutionError;
  metadata?: SafeResultMetadata;
}

export interface SafeResultMetadata {
  toolId: string;
  toolVersion?: string;
  capabilityId?: string;
  durationMs: number;
  timestamp: string;
}
