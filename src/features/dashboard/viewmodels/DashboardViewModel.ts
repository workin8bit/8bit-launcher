/**
 * Dashboard Feature — ViewModel
 * D09 §13-14 — Domain → Presentation + Event → Command
 * ui → viewmodels → ApplicationFacade (never repository/adapter/authority)
 */
import type { ApplicationFacade } from "../../../core/application/facade/ApplicationFacade";
import type { DashboardStore } from "../stores/DashboardStore";
import type { UserContext } from "../../../core/application/types/ApplicationTypes";
import type { DashboardViewState } from "../../../core/application/types/ProjectionTypes";

export class DashboardViewModel {
  private abortController: AbortController | null = null;

  constructor(
    private facade: ApplicationFacade,
    private store: DashboardStore,
    private userContext: UserContext
  ) {}

  get viewState(): DashboardViewState {
    return this.store.get();
  }

  async load(): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const current = this.store.get();
    this.store.set({ ...current, isLoading: true });

    const result = await this.facade.getDashboard(this.userContext);
    if (this.abortController.signal.aborted) return;

    if (result.success) {
      this.store.set({ ...result.data, isLoading: false });
    } else {
      this.store.set({ ...current, isLoading: false });
    }
  }

  subscribe(listener: (s: DashboardViewState) => void): () => void {
    return this.store.subscribe(listener);
  }

  dispose(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
