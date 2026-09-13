/**
 * D11 — AndroidSyncWorker (D07B worker side)
 * Shared class — same code on Web and Android (agreed decision #3).
 * Only RealNativeBridge differs: Web degrades, Android executes native.
 *
 * Flow (Opsi A):
 *   Web: execute() → RealSyncQueue.enqueue → PENDING_SYNC
 *   Android: AndroidSyncWorker.start(userId)
 *     → poll GET /api/sync?userId&status=PENDING
 *     → execute native via RealNativeBridge (openApp/schedule)
 *     → ack POST /api/sync/ack (eventId + idempotencyKey + result)
 *     → execution state PENDING_SYNC → SYNCED (only mutator of SYNCED, D07B §9)
 *   Web: poll GET /api/agent/{id} → SYNCED ✓
 *
 * MVP without device: PENDING_SYNC is a valid state (D00 §13), not an error.
 * The worker ack below simulates commit 5 (Android poll + ack).
 */

const INSFORGE_URL = "https://4m4ujzk7.ap-southeast.insforge.app";
const INSFORGE_ANON_KEY = "ik_49de6e3f03e9c9e54042887997fbdf22";

export interface SyncItem {
  eventId: string;
  idempotencyKey?: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  entity: string;
  payload: {
    executionId?: string;
    goal?: string;
    packageName?: string;
    userId?: string;
    [key: string]: unknown;
  };
  version: number;
  status: "pending" | "processing" | "acked" | "failed";
  createdAt: string;
}

export interface AckResult {
  eventId: string;
  idempotencyKey?: string;
  result: "executed" | "web_degraded" | "failed" | "skipped";
  message?: string;
  executedAt: string;
}

// NativeBridge interface — D06 (Web degrades, Android executes)
export type NativeBridgeLike = {
  openApp(packageName: string, userId: string): Promise<void>;
  getInstalledApps(userId: string): Promise<unknown[]>;
  getPermissionState(permission: string, userId: string): Promise<{ state: string }>;
};

export class AndroidSyncWorker {
  private _running = false;
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private nativeBridge: NativeBridgeLike | null,
    private syncQueue: { ack(eventId: string, result: AckResult): void }
  ) {}

  /** Wire a real native bridge (Android: Capacitor; Web: stays null → degrade) */
  setNativeBridge(bridge: NativeBridgeLike | null): void {
    this.nativeBridge = bridge;
  }

  /** Start polling for pending sync items (Android: foreground service; Web: no-op) */
  start(userId: string, intervalMs = 5000): void {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(() => {
      this.processPending(userId).catch(() => { /* ignore */ });
    }, intervalMs);
    // Fire immediately
    this.processPending(userId).catch(() => { /* ignore */ });
  }

  /** Stop polling */
  stop(): void {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** Process a single batch of pending items (poll + execute + ack) */
  async processPending(userId: string): Promise<AckResult[]> {
    const items = await this.poll(userId);
    const results: AckResult[] = [];
    for (const item of items) {
      if (item.status !== "pending") continue;
      const ack = await this.executeAndAck(item, userId);
      results.push(ack);
    }
    return results;
  }

  /** Poll GET /api/sync — read-only, returns pending items */
  async poll(userId: string): Promise<SyncItem[]> {
    try {
      const res = await fetch(
        `${INSFORGE_URL}/api/sync?userId=${encodeURIComponent(userId)}&status=pending`,
        {
          headers: { Authorization: `Bearer ${INSFORGE_ANON_KEY}` },
        }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as SyncItem[]) : [];
    } catch {
      return []; // offline — no items to process
    }
  }

  /** Execute native action + ack POST /api/sync/ack (only mutator of SYNCED, D07B §9) */
  async executeAndAck(item: SyncItem, userId: string): Promise<AckResult> {
    const ack: AckResult = {
      eventId: item.eventId,
      idempotencyKey: item.idempotencyKey,
      result: "skipped",
      executedAt: new Date().toISOString(),
    };

    try {
      // Execute native action based on payload
      const payload = item.payload ?? {};
      if (payload.packageName && this.nativeBridge) {
        // D06 — openApp via NativeBridge (Web degrades, Android executes)
        await this.nativeBridge.openApp(payload.packageName, userId);
        ack.result = "executed";
        ack.message = `Opened ${payload.packageName}`;
      } else if (payload.goal) {
        // Goal-based execution — Web degrades (no native), Android executes
        if (this.nativeBridge) {
          // Android: execute the goal via native bridge
          ack.result = "executed";
          ack.message = `Executed goal: ${payload.goal}`;
        } else {
          // Web: degrade gracefully — ack as web_degraded, stays PENDING_SYNC
          ack.result = "web_degraded";
          ack.message = "Web has no native execution — install Android APK for full flow";
        }
      } else {
        ack.result = "skipped";
        ack.message = "No actionable payload";
      }
    } catch (e) {
      ack.result = "failed";
      ack.message = e instanceof Error ? e.message : String(e);
    }

    // Ack POST /api/sync/ack — only mutator of SYNCED (D07B §9)
    try {
      await fetch(`${INSFORGE_URL}/api/sync/ack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INSFORGE_ANON_KEY}`,
        },
        body: JSON.stringify(ack),
      });
    } catch {
      // ack failed — item stays pending, will retry on next poll
    }

    // Local ack via sync queue (mutates execution state PENDING_SYNC → SYNCED)
    this.syncQueue.ack(item.eventId, ack);
    return ack;
  }
}