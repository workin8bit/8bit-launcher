/**
 * D11 — RealSyncAdapter (stub — delegates to D07B SyncQueue + SyncTransport)
 * Adapter layer — allowed: authority (src/core/sync), shared
 * Preserves: SyncStatusChanged eventId/correlationId, at-least-once → idempotent, OFFLINE valid
 */

import type { SyncAdapter } from "../../core/application/adapters/SyncAdapter";
import type { SyncStatus } from "../../core/application/types/ProjectionTypes";
import type { Result } from "../../core/application/types/ApplicationTypes";

// Authority interfaces — D07B (stubbed types if real SyncQueue not yet fully typed)
type SyncQueueLike = {
  getStatus(userId: string): Promise<SyncStatus> | SyncStatus;
  observeStatus(userId: string, cb: (s: SyncStatus) => void): () => void;
  flush(userId: string): Promise<void>;
  getPending(userId: string): Promise<unknown[]>;
  getConflicts(userId: string): Promise<unknown[]>;
};

export class RealSyncAdapter implements SyncAdapter {
  constructor(
    private syncQueue: SyncQueueLike,
    // Transport is inside SyncQueue in D07B — injected here for testability, not used directly
    private _transport?: unknown
  ) {}

  async getSyncStatus(userId: string): Promise<Result<SyncStatus>> {
    try {
      const raw = await this.syncQueue.getStatus(userId);
      // Normalize to ProjectionTypes — Real adapter preserves OFFLINE as valid
      const normalized: SyncStatus = {
        status: raw.status,
        pendingCount: raw.pendingCount,
        syncingCount: raw.syncingCount,
        failedCount: raw.failedCount,
        conflictCount: raw.conflictCount,
        lastSyncAt: raw.lastSyncAt,
      };
      return { success: true, data: normalized };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: { code: "SYNC_ERROR", messageKey: "sync.statusFailed", message, retryable: true } };
    }
  }

  observeSync(userId: string, callback: (status: SyncStatus) => void): () => void {
    // Delegate to authority — preserves at-least-once, ViewModel dedups via eventId (D10A)
    return this.syncQueue.observeStatus(userId, callback);
  }

  async requestSync(userId: string): Promise<Result<void>> {
    try {
      await this.syncQueue.flush(userId);
      return { success: true, data: undefined };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: { code: "SYNC_ERROR", messageKey: "sync.requestFailed", message, retryable: true } };
    }
  }

  async getPending(userId: string): Promise<Result<unknown[]>> {
    try {
      const data = await this.syncQueue.getPending(userId);
      return { success: true, data };
    } catch {
      return { success: false, error: { code: "SYNC_ERROR", messageKey: "sync.pendingFailed", retryable: false } };
    }
  }

  async getConflicts(userId: string): Promise<Result<unknown[]>> {
    try {
      const data = await this.syncQueue.getConflicts(userId);
      return { success: true, data };
    } catch {
      return { success: false, error: { code: "SYNC_ERROR", messageKey: "sync.conflictsFailed", retryable: false } };
    }
  }
}
