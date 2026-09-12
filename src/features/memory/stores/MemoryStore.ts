/**
 * Memory Feature — Store
 * Projection of D05 Memory — holds search results / list
 */
import type { MemoryViewState } from "../../../core/application/types/ProjectionTypes";

export interface MemoryListViewState {
  items: MemoryViewState[];
  isLoading: boolean;
  query: string;
  error: { messageKey: string } | null;
}

export class MemoryStore {
  private state: MemoryListViewState = { items: [], isLoading: false, query: "", error: null };
  private listeners = new Set<(s: MemoryListViewState) => void>();

  get(): MemoryListViewState {
    return { ...this.state, items: [...this.state.items] };
  }

  set(next: MemoryListViewState): void {
    this.state = { ...next, items: [...next.items] };
    this.emit();
  }

  setLoading(isLoading: boolean): void {
    this.state = { ...this.state, isLoading };
    this.emit();
  }

  subscribe(listener: (s: MemoryListViewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.get();
    for (const l of this.listeners) l(snap);
  }
}
