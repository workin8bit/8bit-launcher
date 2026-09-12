/**
 * D10A §5 — InteractionBus (typed, for D10A cross-feature events)
 * Wrapper over D09 EventBus — domain interaction events, not generic ApplicationEvent
 * Feature does NOT subscribe Authority directly — via Facade → InteractionBus
 */

import type { InteractionEvent, InteractionEventType } from "./types/InteractionEvents";

type Handler<T = unknown> = (event: Readonly<InteractionEvent<T>>) => void;

export interface IInteractionBus {
  publish<T>(event: InteractionEvent<T>): void;
  subscribe<T>(eventType: InteractionEventType, handler: Handler<T>): () => void;
  dispose(): void;
}

export class InMemoryInteractionBus implements IInteractionBus {
  private handlers = new Map<InteractionEventType, Set<Handler>>();
  private disposed = false;

  publish<T>(event: InteractionEvent<T>): void {
    if (this.disposed) return;
    // Freeze to enforce forbidden mutation (§29)
    Object.freeze(event);
    if (event.payload && typeof event.payload === "object") Object.freeze(event.payload);
    const set = this.handlers.get(event.eventType);
    if (!set) return;
    for (const h of set) {
      try { (h as Handler<T>)(event); } catch { /* isolate */ }
    }
  }

  subscribe<T>(eventType: InteractionEventType, handler: Handler<T>): () => void {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, new Set());
    this.handlers.get(eventType)!.add(handler as Handler);
    return () => this.handlers.get(eventType)?.delete(handler as Handler);
  }

  dispose(): void {
    this.disposed = true;
    this.handlers.clear();
  }
}
