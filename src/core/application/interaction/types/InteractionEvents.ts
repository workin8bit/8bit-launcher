/**
 * D10A §5, §10 — Interaction Event Contracts
 * PastTense, immutable, typed — notification only, not command
 * Authority produces, Store consumes via Facade/EventBus
 */

export type InteractionEventType =
  | "ExecutionCreated"
  | "ExecutionStateChanged"
  | "ExecutionProgress"
  | "ExecutionCompleted"
  | "ExecutionFailed"
  | "SyncStatusChanged"
  | "SyncConflictDetected"
  | "SyncCompleted"
  | "MemoryCreated"
  | "AndroidAppListChanged";

export interface InteractionEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: InteractionEventType;
  readonly aggregateId: string; // executionId, syncId, memoryId
  readonly payload: Readonly<TPayload>;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly timestamp: string; // ISO-8601 UTC — authority clock
  readonly version: number;
  readonly userId: string;
}

// Typed payloads — no `any`, no secrets

export interface ExecutionStateChangedPayload {
  readonly executionId: string;
  readonly status: "QUEUED" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED" | "DENIED";
  readonly progress?: number;
  readonly error?: { messageKey: string; category: string } | null;
}

export interface SyncStatusChangedPayload {
  readonly status: "SYNCED" | "SYNCING" | "OFFLINE" | "ATTENTION";
  readonly pendingCount: number;
  readonly syncingCount: number;
  readonly failedCount: number;
  readonly conflictCount: number;
  readonly lastSyncAt?: string;
}

export interface ExecutionCompletedPayload {
  readonly executionId: string;
  readonly completedAt: string;
}

export interface ExecutionFailedPayload {
  readonly executionId: string;
  readonly error: { messageKey: string; category: string };
}

export function createInteractionEvent<TPayload>(
  type: InteractionEventType,
  aggregateId: string,
  payload: TPayload,
  userId: string,
  correlationId: string,
  causationId?: string
): InteractionEvent<TPayload> {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    eventType: type,
    aggregateId,
    payload: Object.freeze(payload) as Readonly<TPayload>,
    correlationId,
    causationId,
    timestamp: new Date().toISOString(),
    version: 1,
    userId,
  };
}
