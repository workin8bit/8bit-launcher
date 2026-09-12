/**
 * D09 §15-16 — Presentation Store (not source of truth)
 * Store = Authority State → Projection → Store → ViewModel → UI
 * Store MUST NOT: Store → Authority mutation
 */

import type { ExecutionViewState } from "../types/ProjectionTypes";

export class ExecutionViewStore {
  private state: Map<string, ExecutionViewState> = new Map();
  private listeners = new Set<(state: Map<string, ExecutionViewState>) => void>();

  set(executionId: string, viewState: ExecutionViewState): void {
    // D09 §150 Determinism: same authority state → same projection
    this.state.set(executionId, { ...viewState });
    this.emit();
  }

  get(executionId: string): ExecutionViewState | undefined {
    return this.state.get(executionId);
  }

  list(): ExecutionViewState[] {
    return Array.from(this.state.values());
  }

  // For process death recovery D09 §55 — reset and rehydrate from authority
  reset(): void {
    this.state.clear();
    this.emit();
  }

  subscribe(listener: (state: Map<string, ExecutionViewState>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }
}
