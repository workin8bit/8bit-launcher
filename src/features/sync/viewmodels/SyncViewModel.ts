/**
 * Sync Feature — ViewModel (sync state/projection)
 * D09 §159, §170-173 — Sync follows D07B, not ViewModel
 * ViewModel observes Facade → SyncService → D07B, never mutates SyncQueue
 */
import type { ApplicationFacade } from "../../../core/application/facade/ApplicationFacade";
import type { SyncStore } from "../stores/SyncStore";
import type { UserContext } from "../../../core/application/types/ApplicationTypes";

export class SyncViewModel {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private facade: ApplicationFacade,
    private store: SyncStore,
    private userContext: UserContext
  ) {}

  get viewState() {
    return this.store.get();
  }

  // Subscribe to authority projection — lifecycle controlled (D09 §153)
  startObserving(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.facade.observeSync(this.userContext, status => {
      this.store.set({
        status: status.status,
        pendingCount: status.pendingCount,
        syncingCount: status.syncingCount,
        failedCount: status.failedCount,
        conflictCount: status.conflictCount,
        lastSyncAt: status.lastSyncAt,
        lastErrorCategory: undefined,
        canRetry: status.failedCount > 0 || status.conflictCount > 0,
      });
    });
  }

  stopObserving(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async onRetry(): Promise<void> {
    if (!this.store.get().canRetry) return;
    // D09 §157 — Retry goes via Command → Service → D07B, not ViewModel logic
    // In real wiring this would dispatch RetrySyncCommand via Facade
  }

  async refresh(): Promise<void> {
    const result = await this.facade.getSyncStatus(this.userContext);
    if (result.success) {
      this.store.set({
        status: result.data.status,
        pendingCount: result.data.pendingCount,
        syncingCount: result.data.syncingCount,
        failedCount: result.data.failedCount,
        conflictCount: result.data.conflictCount,
        lastSyncAt: result.data.lastSyncAt,
        canRetry: result.data.failedCount > 0 || result.data.conflictCount > 0,
      });
    }
  }

  subscribe(listener: (s: ReturnType<SyncStore["get"]>) => void): () => void {
    return this.store.subscribe(listener);
  }

  dispose(): void {
    this.stopObserving();
  }
}
