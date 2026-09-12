/**
 * D09 §37-38, §95-96 — Event Propagation
 * Authority Event → Adapter → Application Event → Store → ViewModel → UI
 * Typed, no secrets
 */

export type ApplicationEventType =
  | "EXECUTION_UPDATED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "SCHEDULER_UPDATED"
  | "SYNC_STATUS_CHANGED"
  | "SYNC_CONFLICT_DETECTED"
  | "MEMORY_UPDATED"
  | "NOTIFICATION_CREATED"
  | "AUTH_STATE_CHANGED"
  | "CONNECTIVITY_CHANGED";

export interface ApplicationEvent<TPayload = unknown> {
  eventId: string;
  eventType: ApplicationEventType;
  timestamp: string;
  correlationId: string;
  aggregateId?: string; // executionId, memoryId, etc.
  payload: TPayload;
  userId: string;
}

export function createApplicationEvent<T>(
  type: ApplicationEventType,
  payload: T,
  userId: string,
  correlationId: string,
  aggregateId?: string
): ApplicationEvent<T> {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    eventType: type,
    timestamp: new Date().toISOString(),
    correlationId,
    aggregateId,
    payload,
    userId,
  };
}
