/**
 * Dashboard Feature — Store
 * D09 §15 — Presentation state only, not source of truth
 * Allowed imports: shared only (types/events)
 */
import type { DashboardViewState } from "../../../core/application/types/ProjectionTypes";

export class DashboardStore {
  private state: DashboardViewState = {
    execution: { active: 0, failed: 0 },
    sync: { status: "SYNCED", pendingCount: 0, syncingCount: 0, failedCount: 0, conflictCount: 0, canRetry: false },
    scheduler: { queued: 0, scheduled: 0, running: 0, retryDelay: 0, paused: 0 },
    recentActivity: [],
    isLoading: false,
  };
  private listeners = new Set<(s: DashboardViewState) => void>();

  get(): DashboardViewState {
    return { ...this.state, sync: { ...this.state.sync }, execution: { ...this.state.execution } };
  }

  set(next: DashboardViewState): void {
    this.state = {
      ...next,
      sync: { ...next.sync },
      execution: { ...next.execution },
      scheduler: { ...next.scheduler },
      recentActivity: [...next.recentActivity],
    };
    this.emit();
  }

  subscribe(listener: (s: DashboardViewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.state.isLoading = false;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.get();
    for (const l of this.listeners) l(snapshot);
  }
}
