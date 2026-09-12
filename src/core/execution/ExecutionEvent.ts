/**
 * D07 §46-48 — Execution Journal & Audit
 * Journal: what happened | Audit: who/what authority
 * Never store secrets in journal
 */

import type { ExecutionState } from "./types/ExecutionState";

export type ExecutionEventType =
  | "EXECUTION_CREATED"
  | "PLAN_VALIDATED"
  | "PLAN_REJECTED"
  | "STEP_READY"
  | "PERMISSION_CHECKED"
  | "ACTION_STARTED"
  | "ACTION_COMPLETED"
  | "VERIFICATION_STARTED"
  | "VERIFICATION_COMPLETED"
  | "RECOVERY_STARTED"
  | "RETRY_STARTED"
  | "USER_CONFIRMATION_REQUESTED"
  | "USER_CONFIRMED"
  | "USER_CANCELLED"
  | "EXECUTION_PAUSED"
  | "EXECUTION_RESUMED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "EXECUTION_CANCELLED"
  | "EXECUTION_DENIED"
  | "STATE_TRANSITION";

export interface ExecutionJournalEntry {
  eventId: string;
  executionId: string;
  stepId?: string;
  eventType: ExecutionEventType;
  timestamp: string;
  actor: string; // userId / system
  stateBefore?: ExecutionState;
  stateAfter?: ExecutionState;
  correlationId: string;
  safeMetadata?: Record<string, unknown>;
}

export interface AuditEvent {
  eventId: string;
  executionId: string;
  stepId?: string;
  actor: string;
  action: string;
  authority: string; // which policy/permission granted
  timestamp: string;
  result: "success" | "denied" | "failed";
  reason?: string;
  safeMetadata?: Record<string, unknown>;
}

// Factory — ensures no secrets
export function createJournalEntry(params: {
  executionId: string;
  stepId?: string;
  eventType: ExecutionEventType;
  actor: string;
  correlationId: string;
  stateBefore?: ExecutionState;
  stateAfter?: ExecutionState;
  safeMetadata?: Record<string, unknown>;
}): ExecutionJournalEntry {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    executionId: params.executionId,
    stepId: params.stepId,
    eventType: params.eventType,
    timestamp: new Date().toISOString(),
    actor: params.actor,
    stateBefore: params.stateBefore,
    stateAfter: params.stateAfter,
    correlationId: params.correlationId,
    safeMetadata: sanitizeMetadata(params.safeMetadata),
  };
}

function sanitizeMetadata(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const forbidden = ["password", "token", "secret", "apiKey", "privateKey", "credential"];
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (forbidden.some(f => k.toLowerCase().includes(f.toLowerCase()))) {
      sanitized[k] = "[REDACTED]";
    } else if (typeof v === "string" && v.length > 500) {
      sanitized[k] = v.slice(0, 500) + "...[TRUNCATED]";
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}
