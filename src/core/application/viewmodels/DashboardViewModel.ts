/**
 * D09 §135-136 — Dashboard ViewModel (composition, not authority)
 * Aggregates: execution, sync, scheduler projections
 */

import type { ApplicationFacade } from "../facade/ApplicationFacade";
import type { DashboardViewState } from "../types/ProjectionTypes";
import type { UserContext } from "../types/ApplicationTypes";

export class DashboardViewModel {
  private state: DashboardViewState = {
    execution: { active: 0, failed: 0 },
    sync: { status: "SYNCED", pendingCount: 0, syncingCount: 0, failedCount: 0, conflictCount: 0, canRetry: false },
    scheduler: { queued: 0, scheduled: 0, running: 0, retryDelay: 0, paused: 0 },
    recentActivity: [],
    isLoading: true,
  };
  private listeners = new Set<(s: DashboardViewState) => void>();
  private abortController?: AbortController;

  constructor(
    private facade: ApplicationFacade,
    private userContext: UserContext
  ) {}

  get viewState(): DashboardViewState { return { ...this.state }; }

  async load(): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.state.isLoading = true;
    this.emit();

    const result = await this.facade.getDashboard(this.userContext);
    if (result.success) {
      this.state = { ...result.data, isLoading: false };
    } else {
      this.state.isLoading = false;
      // D09 §39 Error Authority — show presentation error, not retry logic here
    }
    this.emit();
  }

  subscribe(listener: (s: DashboardViewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.viewState);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.abortController?.abort();
    this.listeners.clear();
  }

  private emit(): void {
    for (const l of this.listeners) l(this.viewState);
  }
}
