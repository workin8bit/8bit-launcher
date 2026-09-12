/**
 * D09 §24 — D07B Sync Adapter
 * Frontend MUST NOT queue.push() directly — only via SyncService → Adapter → D07B
 */

import type { Result } from "../types/ApplicationTypes";
import type { SyncStatus } from "../types/ProjectionTypes";

export type { SyncStatus } from "../types/ProjectionTypes";

export interface SyncAdapter {
  getSyncStatus(userId: string): Promise<Result<SyncStatus>>;
  observeSync(userId: string, callback: (status: SyncStatus) => void): () => void;
  requestSync(userId: string): Promise<Result<void>>;
  getPending(userId: string): Promise<Result<unknown[]>>;
  getConflicts(userId: string): Promise<Result<unknown[]>>;
}

export class FakeSyncAdapter implements SyncAdapter {
  async getSyncStatus(): Promise<Result<SyncStatus>> {
    return { success: true, data: { status: "SYNCED", pendingCount: 0, syncingCount: 0, failedCount: 0, conflictCount: 0, lastSyncAt: new Date().toISOString() } };
  }
  observeSync(): () => void { return () => {}; }
  async requestSync(): Promise<Result<void>> { return { success: true, data: undefined }; }
  async getPending(): Promise<Result<unknown[]>> { return { success: true, data: [] }; }
  async getConflicts(): Promise<Result<unknown[]>> { return { success: true, data: [] }; }
}
