/**
 * D07 §9, §15, §17-18 — Plan Step & Dependency Graph
 * D04 §8 — Plan Contract (Step)
 * D03 — ToolDefinition authority
 */

import type { PermissionLevel } from "./ExecutionTypes";

export type ExecutionStepStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "WAITING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED"
  | "UNKNOWN"; // D07 §39 — UNKNOWN_OUTCOME

export interface PlanStep {
  /** Unique within plan: "step-1" */
  stepId: string;
  /** Sequential index */
  stepIndex: number;
  /** Must exist in D03 ToolRegistry */
  toolId: string;
  /** Tool version for compatibility check D07 §57 */
  toolVersion?: string;
  /** Valid per ToolDefinition.inputSchema */
  input: Record<string, unknown>;
  /** Dependency stepIds — must form DAG D07 §17 */
  dependencyIds?: string[];
  /** Human-readable expected outcome for Verifier D04 §8 */
  expectedOutcome: string;
  /** Verification criteria D07 §23 */
  verification?: VerificationCriteria;
  /** D07 §33 */
  timeout?: TimeoutPolicy;
  /** D07 §35 */
  retryPolicy?: RetryPolicy;
  /** Copy from ToolDefinition — informational, validated by Validator */
  permissionLevel: PermissionLevel;
}

export interface VerificationCriteria {
  type: VerificationType;
  target: string;
  expected?: unknown;
  required: boolean;
}

export type VerificationType =
  | "OUTPUT_EXISTS"
  | "OUTPUT_MATCHES_SCHEMA"
  | "RESOURCE_CREATED"
  | "RESOURCE_OPENED"
  | "FILE_WRITTEN"
  | "FILE_READ"
  | "NETWORK_STATE_MATCH"
  | "ANDROID_RESULT_SUCCESS"
  | "USER_CONFIRMED"
  | "CUSTOM_TOOL_VERIFIER";

export interface TimeoutPolicy {
  timeoutMs: number;
  onTimeout: "FAIL" | "RECOVER" | "RETRY";
}

export interface RetryPolicy {
  maxAttempts: number;
  backoff: "NONE" | "LINEAR" | "EXPONENTIAL";
  retryableErrors?: string[]; // NativeErrorCode[]
}

export interface StepExecutionResult {
  stepId: string;
  status: ExecutionStepStatus;
  result?: unknown;
  error?: import("./ExecutionResult").ExecutionError;
  attempt: number;
  durationMs: number;
  verification?: import("./ExecutionResult").VerificationResult;
}
