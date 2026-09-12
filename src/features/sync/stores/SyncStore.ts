/**
 * Sync Feature — Store
 * Projection of D07B SyncQueue — holds SyncViewState
 * Store is presentation projection, not SyncQueue itself (D07B owns queue)
 */
import type { SyncViewState } from "../../../core/application/types/ProjectionTypes";

export class SyncStore {
  private state: SyncViewState = {
    status: "SYNCED",
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    canRetry: false,
  };
  private listeners = new Set<(s: SyncViewState) => void>();

  get(): SyncViewState {
    return { ...this.state };
  }

  set(next: SyncViewState): void {
    this.state = { ...next };
    this.emit();
  }

  subscribe(listener: (s: SyncViewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.get();
    for (const l of this.listeners) l(snap);
  }
}
