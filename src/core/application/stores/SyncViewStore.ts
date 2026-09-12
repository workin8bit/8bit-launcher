/**
 * D09 §15 — SyncViewStore
 */

import type { SyncViewState } from "../types/ProjectionTypes";

export class SyncViewStore {
  private state: SyncViewState = {
    status: "SYNCED",
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    canRetry: false,
  };
  private listeners = new Set<(s: SyncViewState) => void>();

  set(state: SyncViewState): void {
    this.state = { ...state };
    this.emit();
  }

  get(): SyncViewState { return { ...this.state }; }

  subscribe(listener: (s: SyncViewState) => void): () => void {
    this.listeners.add(listener);
    // Immediate emit current
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.state = { status: "SYNCED", pendingCount: 0, syncingCount: 0, failedCount: 0, conflictCount: 0, canRetry: false };
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l(this.get());
  }
}
