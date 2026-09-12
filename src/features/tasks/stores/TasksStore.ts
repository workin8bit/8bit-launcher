/**
 * Tasks Feature — Store
 * D09 §15 — Presentation state only
 * Tasks are projections of Execution (D07) — store holds view state, not domain
 */
import type { ExecutionViewState } from "../../../core/application/types/ProjectionTypes";

export interface TasksViewState {
  tasks: ExecutionViewState[];
  isLoading: boolean;
  error: { messageKey: string } | null;
}

export class TasksStore {
  private state: TasksViewState = { tasks: [], isLoading: false, error: null };
  private listeners = new Set<(s: TasksViewState) => void>();

  get(): TasksViewState {
    return { ...this.state, tasks: [...this.state.tasks] };
  }

  set(next: TasksViewState): void {
    this.state = { ...next, tasks: [...next.tasks] };
    this.emit();
  }

  setLoading(isLoading: boolean): void {
    this.state = { ...this.state, isLoading };
    this.emit();
  }

  subscribe(listener: (s: TasksViewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.get();
    for (const l of this.listeners) l(snap);
  }
}
