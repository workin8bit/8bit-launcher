/**
 * Execution Feature — Store
 * Projection of D07 Execution — holds per-execution view state
 */
import type { ExecutionViewState } from "../../../core/application/types/ProjectionTypes";

export class ExecutionStore {
  private state = new Map<string, ExecutionViewState>();
  private listeners = new Set<(m: Map<string, ExecutionViewState>) => void>();

  get(executionId: string): ExecutionViewState | undefined {
    const v = this.state.get(executionId);
    return v ? { ...v } : undefined;
  }

  list(): ExecutionViewState[] {
    return Array.from(this.state.values()).map(v => ({ ...v }));
  }

  set(executionId: string, viewState: ExecutionViewState): void {
    this.state.set(executionId, { ...viewState });
    this.emit();
  }

  clear(): void {
    this.state.clear();
    this.emit();
  }

  subscribe(listener: (m: Map<string, ExecutionViewState>) => void): () => void {
    this.listeners.add(listener);
    listener(new Map(this.state));
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = new Map(this.state);
    for (const l of this.listeners) l(snap);
  }
}
