/**
 * D10A §6, §17 — Reconciliation (pure helpers for ViewModel/Store)
 * ViewModel does NOT reconcile — Facade does — but helpers are shared for testing
 */

import { isStale, DeduplicationSet } from "./types/InteractionState";
import type { InteractionEvent } from "./types/InteractionEvents";

export interface ReconciliationResult<T> {
  shouldApply: boolean;
  reason: "fresh" | "stale" | "duplicate";
  state: T;
}

export function shouldApplyEvent<T extends { timestamp: string; version?: number }>(
  event: InteractionEvent<unknown> & { timestamp: string },
  lastState: T | null,
  dedup: DeduplicationSet
): ReconciliationResult<T> {
  if (!dedup.add(event.eventId)) {
    // Return lastState as-is — duplicate ignored, but need to satisfy T
    // For duplicate, state is previous state, not event payload
    return { shouldApply: false, reason: "duplicate", state: lastState as T };
  }
  if (lastState && isStale(event, lastState)) {
    return { shouldApply: false, reason: "stale", state: lastState };
  }
  // Fresh — caller should map event.payload → T and apply
  return { shouldApply: true, reason: "fresh", state: lastState as T };
}
