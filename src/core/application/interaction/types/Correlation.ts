/**
 * D10A §12-13 — Correlation / Causation / EventId
 * Every Command → Event chain shares correlationId — for tracing, not dedup
 */

export interface CorrelationContext {
  correlationId: string; // corr_xxx — from originating Command
  causationId?: string;  // parent eventId if chained
  eventId: string;       // evt_xxx — unique per event instance
}

export function createCorrelation(correlationId?: string, causationId?: string): CorrelationContext {
  return {
    correlationId: correlationId ?? `corr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    causationId,
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  };
}

export function createEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
