/**
 * D10A §6, §17 — State Synchronization Helpers
 * Stale check, dedup, projection helpers — pure, no side effects
 */

export interface Timestamped {
  timestamp: string;
  version?: number;
}

export function isStale(event: Timestamped, last: Timestamped | null): boolean {
  if (!last) return false;
  if (event.version !== undefined && last.version !== undefined) {
    if (event.version < last.version) return true;
    if (event.version > last.version) return false;
  }
  return new Date(event.timestamp).getTime() < new Date(last.timestamp).getTime();
}

export class DeduplicationSet {
  private seen = new Set<string>();
  private maxSize: number;
  constructor(maxSize = 1000) { this.maxSize = maxSize; }

  has(eventId: string): boolean { return this.seen.has(eventId); }

  add(eventId: string): boolean {
    if (this.seen.has(eventId)) return false; // duplicate
    if (this.seen.size >= this.maxSize) {
      const first = this.seen.values().next().value as string;
      this.seen.delete(first);
    }
    this.seen.add(eventId);
    return true;
  }

  clear(): void { this.seen.clear(); }
  size(): number { return this.seen.size; }
}

export interface ReconciliationInput<T> {
  current: T & Timestamped;
  incoming: T & Timestamped;
}

export function reconcile<T extends Timestamped>(input: ReconciliationInput<T>): T {
  if (isStale(input.incoming, input.current)) return input.current;
  return input.incoming;
}
