/**
 * D11 — RealSyncAdapter (delegates to D07B SyncQueue + SyncTransport)
 * Adapter layer — allowed: authority, shared
 * Preserves: SyncStatusChanged eventId/correlationId, at-least-once → idempotent, OFFLINE valid
 */

import type { SyncAdapter } from "../../core/application/adapters/SyncAdapter";
import type { SyncStatus } from "../../core/application/types/ProjectionTypes";
import type { Result } from "../../core/application/types/ApplicationTypes";

// Authority interface — D07B
type SyncQueueLike = {
  getStatus(userId: string): Promise<unknown> | unknown;
  observeStatus(userId: string, cb: (s: unknown) => void): () => void;
  flush(userId: string): Promise<void>;
  getPending(userId: string): Promise<unknown[]>;
  getConflicts(userId: string): Promise<unknown[]>;
};

function toSyncStatus(raw: unknown): SyncStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    status: (r.status as SyncStatus["status"]) ?? "OFFLINE",
    pendingCount: Number(r.pendingCount) || 0,
    syncingCount: Number(r.syncingCount) || 0,
    failedCount: Number(r.failedCount) || 0,
    conflictCount: Number(r.conflictCount) || 0,
    lastSyncAt: r.lastSyncAt ? String(r.lastSyncAt) : undefined,
  };
}

export class RealSyncAdapter implements SyncAdapter {
  constructor(
    private syncQueue: SyncQueueLike,
    private _transport?: unknown
  ) {}

  async getSyncStatus(userId: string): Promise<Result<SyncStatus>> {
    try {
      const raw = await this.syncQueue.getStatus(userId);
      return { success: true, data: toSyncStatus(raw) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: { code: "SYNC_ERROR", messageKey: "sync.statusFailed", message, retryable: true } };
    }
  }

  observeSync(userId: string, callback: (status: SyncStatus) => void): () => void {
    return this.syncQueue.observeStatus(userId, (s) => callback(toSyncStatus(s)));
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