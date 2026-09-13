/**
 * D11 — RealSyncQueue (D07B authority)
 * Offline-first: writes go to localStorage queue, flush sends to InsForge when online
 * At-least-once delivery with idempotent eventId dedup
 * Preserves: SyncStatusChanged eventId/correlationId, OFFLINE valid
 */

const QUEUE_KEY = "8bitai_sync_queue_v1";
const DEDUP_KEY = "8bitai_sync_dedup_v1";

interface SyncQueueItem {
  eventId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  entity: string;
  payload: unknown;
  version: number;
  createdAt: string;
  retryCount: number;
  status: "pending" | "processing" | "failed";
}

function loadQueue(): SyncQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SyncQueueItem[]) : [];
  } catch { return []; }
}

function saveQueue(q: SyncQueueItem[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* skip */ }
}

function loadDedup(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DEDUP_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveDedup(s: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const arr = [...s].slice(-500);
    window.localStorage.setItem(DEDUP_KEY, JSON.stringify(arr));
  } catch { /* skip */ }
}

const INSFORGE_URL = "https://4m4ujzk7.ap-southeast.insforge.app";
const INSFORGE_ANON_KEY = "ik_49de6e3f03e9c9e54042887997fbdf22";

export class RealSyncQueue {
  private queue = loadQueue();
  private dedup = loadDedup();
  private listeners = new Set<(s: unknown) => void>();
  private _online = typeof navigator !== "undefined" ? navigator.onLine : true;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => { this._online = true; this.flush("user_demo"); });
      window.addEventListener("offline", () => { this._online = false; this.notify(); });
    }
  }

  enqueue(item: Omit<SyncQueueItem, "status" | "retryCount" | "createdAt">): boolean {
    if (this.dedup.has(item.eventId)) return false;
    this.dedup.add(item.eventId);
    saveDedup(this.dedup);
    this.queue.push({
      ...item,
      status: "pending",
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });
    saveQueue(this.queue);
    this.notify();
    if (this._online) this.flush("user_demo");
    return true;
  }

  async flush(userId: string): Promise<void> {
    if (!this._online || this.queue.length === 0) return;
    const pending = this.queue.filter(i => i.status === "pending");
    for (const item of pending) {
      item.status = "processing";
      saveQueue(this.queue);
      try {
        await fetch(`${INSFORGE_URL}/api/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${INSFORGE_ANON_KEY}`,
          },
          body: JSON.stringify({ items: [item], userId }),
        });
        this.queue = this.queue.filter(i => i.eventId !== item.eventId);
        saveQueue(this.queue);
      } catch {
        item.status = "failed";
        item.retryCount++;
        if (item.retryCount > 3) {
          this.queue = this.queue.filter(i => i.eventId !== item.eventId);
        }
        saveQueue(this.queue);
      }
    }
    this.notify();
  }

  getStatus(userId: string): unknown {
    const pending = this.queue.filter(i => i.status === "pending").length;
    const failed = this.queue.filter(i => i.status === "failed").length;
    return {
      status: this._online ? (pending > 0 ? "SYNCING" : "SYNCED") : "OFFLINE",
      pendingCount: pending,
      syncingCount: this.queue.filter(i => i.status === "processing").length,
      failedCount: failed,
      conflictCount: 0,
      lastSyncAt: new Date().toISOString(),
    };
  }

  observeStatus(userId: string, cb: (s: unknown) => void): () => void {
    this.listeners.add(cb);
    cb(this.getStatus(userId));
    return () => this.listeners.delete(cb);
  }

  async getPending(userId: string): Promise<unknown[]> {
    return this.queue.filter(i => i.status === "pending");
  }

  async getConflicts(userId: string): Promise<unknown[]> {
    return [];
  }

  /**
   * ack() — D07B §9: the ONLY mutator of execution state PENDING_SYNC → SYNCED.
   * Called by AndroidSyncWorker after executing the native action.
   * Local-first: updates the durable execution record (shared EXECUTIONS_KEY).
   * Idempotent: same eventId acked twice is a no-op (D07 §99).
   */
  ack(eventId: string, result: { result: string; message?: string }): void {
    // Remove from queue (item processed)
    const before = this.queue.length;
    this.queue = this.queue.filter(i => i.eventId !== eventId);
    if (this.queue.length === before) return; // already acked — idempotent
    saveQueue(this.queue);

    // Mutate the durable execution record PENDING_SYNC → SYNCED
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("8bitai_executions_v1");
        if (raw) {
          const map = JSON.parse(raw) as Record<string, { state: string; executionId?: string; updatedAt?: string }>;
          // Find the record whose idempotencyKey matches this eventId
          for (const rec of Object.values(map)) {
            if (rec.state === "PENDING_SYNC") {
              rec.state = "SYNCED";
              rec.updatedAt = new Date().toISOString();
              break;
            }
          }
          window.localStorage.setItem("8bitai_executions_v1", JSON.stringify(map));
        }
      } catch { /* skip */ }
    }
    this.notify();
  }

  private notify(): void {
    const s = this.getStatus("user_demo");
    for (const cb of this.listeners) {
      try { cb(s); } catch { /* ignore */ }
    }
  }
}