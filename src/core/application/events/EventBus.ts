/**
 * D09 §41, §95 — Event Bus (typed, scoped, lifecycle-aware)
 * Not a global dumping ground — authority semantics remain in authority
 */

import type { ApplicationEvent, ApplicationEventType } from "./ApplicationEvents";

type Handler<T = unknown> = (event: ApplicationEvent<T>) => void;

export interface IEventBus {
  emit<T>(event: ApplicationEvent<T>): void;
  on<T>(eventType: ApplicationEventType, handler: Handler<T>): () => void; // returns unsubscribe
  dispose(): void;
}

export class InMemoryEventBus implements IEventBus {
  private handlers = new Map<ApplicationEventType, Set<Handler>>();
  private disposed = false;

  emit<T>(event: ApplicationEvent<T>): void {
    if (this.disposed) return;
    const set = this.handlers.get(event.eventType);
    if (!set) return;
    for (const h of set) {
      try { (h as Handler<T>)(event); } catch { /* isolate */ }
    }
  }

  on<T>(eventType: ApplicationEventType, handler: Handler<T>): () => void {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, new Set());
    this.handlers.get(eventType)!.add(handler as Handler);
    return () => this.handlers.get(eventType)?.delete(handler as Handler);
  }

  dispose(): void {
    this.disposed = true;
    this.handlers.clear();
  }
}
