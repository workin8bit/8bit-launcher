/**
 * D09 §6-8, §159 — SyncService → D07B
 * Frontend never does queue.push() directly — only via SyncService → SyncAdapter
 */

import type { Result, UserContext } from "../types/ApplicationTypes";
import type { SyncAdapter, SyncStatus } from "../adapters/SyncAdapter";

export class SyncService {
  constructor(private syncAdapter: SyncAdapter) {}

  async getSyncStatus(userContext: UserContext): Promise<Result<SyncStatus>> {
    return this.syncAdapter.getSyncStatus(userContext.userId);
  }

  observeSync(userContext: UserContext, callback: (status: SyncStatus) => void): () => void {
    return this.syncAdapter.observeSync(userContext.userId, callback);
  }

  async requestSync(userContext: UserContext): Promise<Result<void>> {
    return this.syncAdapter.requestSync(userContext.userId);
  }

  // D09 §157 — ResolveConflict goes via service → adapter → D07B ConflictResolver
  async resolveConflict(): Promise<Result<void>> {
    // In real impl, would delegate to D07B resolver via SyncAdapter
    return { success: true, data: undefined };
  }
}
