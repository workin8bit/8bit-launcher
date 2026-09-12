/**
 * D09 §11-12, §77, §146-147 — Command / Query / Result / Error Contracts
 * Contract-first, typed, no `any`, correlationId for tracing
 */

// ── Context ──
export interface UserContext {
  userId: string;
  sessionId?: string;
  deviceId?: string;
}

export interface CorrelationContext {
  correlationId: string;
  causationId?: string; // parent commandId
}

// ── Command Contract D09 §11 ──
export interface ApplicationCommand<TPayload = unknown> {
  commandId: string; // uuid — for tracing & app-level deduplication (§101)
  type: string; // e.g., "ExecuteTask", "CancelTask", "CreateMemory"
  payload: TPayload;
  userContext: UserContext;
  createdAt: string;
  correlationId: string;
}

export function createCommand<T>(type: string, payload: T, userContext: UserContext, correlationId?: string): ApplicationCommand<T> {
  return {
    commandId: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    userContext,
    createdAt: new Date().toISOString(),
    correlationId: correlationId ?? `corr_${Date.now()}`,
  };
}

// ── Query Contract D09 §12 ──
export interface ApplicationQuery<TParams = unknown> {
  queryId: string;
  type: string; // e.g., "GetExecution", "GetDashboard", "GetSyncStatus"
  parameters: TParams;
  userContext: UserContext;
  correlationId: string;
}

export function createQuery<T>(type: string, parameters: T, userContext: UserContext, correlationId?: string): ApplicationQuery<T> {
  return {
    queryId: `qry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    parameters,
    userContext,
    correlationId: correlationId ?? `corr_${Date.now()}`,
  };
}

// ── Result Contract D09 §77, §147 ──
export type Result<T, E = ApplicationError> = { success: true; data: T } | { success: false; error: E };

export interface ApplicationError {
  code: string; // e.g., "VALIDATION_ERROR", "PERMISSION_DENIED", "OFFLINE"
  messageKey: string; // i18n key, not hard-coded copy (§79)
  message?: string; // fallback human-readable
  retryable: boolean; // from authority, frontend never invents (§77)
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

// Error categories D09 §39 — mapped from authority errors
export type ApplicationErrorCategory =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NETWORK_ERROR"
  | "OFFLINE"
  | "CONFLICT"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "EXECUTION_ERROR"
  | "SYNC_ERROR"
  | "UNKNOWN";

// ── Common Payloads ──
export interface ExecuteTaskPayload {
  goal: string;
  // Optional: structured plan already from D04, or raw intent for Agent Core to plan
  planId?: string;
  priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | "DEFERRED";
}

export interface CancelTaskPayload { executionId: string; }
export interface GetExecutionParams { executionId: string; }
export interface GetExecutionsParams { limit?: number; offset?: number; status?: string; }
export interface SearchMemoryParams { query: string; topK?: number; }
export interface OpenAndroidAppPayload { packageName: string; uri?: string; }
