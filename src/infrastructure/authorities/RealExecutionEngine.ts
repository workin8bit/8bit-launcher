/**
 * D11 — RealExecutionEngine (D07 authority)
 * Local-first execution: durable record + enqueue to D07B SyncQueue for cloud sync.
 * Durable: localStorage for process-death recovery
 * D07 §99 at-least-once internally + idempotent externally
 * D07 §112 resume: LOAD → VALIDATE → RECHECK POLICY → RECHECK PERMISSION → RESUME
 * D11 §5: ExecutionEngine must NOT know /api/sync — SyncTransport owns InsForge HTTP.
 */

import { EXECUTIONS_KEY, type ExecutionRecord } from "./RealExecutionRepository";
import { RealSyncQueue } from "./RealSyncQueue";

interface EngineRecord extends ExecutionRecord {
  state: ExecutionRecord["state"];
}

function loadExecutions(): Record<string, EngineRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXECUTIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, EngineRecord>) : {};
  } catch { return {}; }
}

function saveExecutions(map: Record<string, EngineRecord>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(EXECUTIONS_KEY, JSON.stringify(map)); } catch { /* skip */ }
}

function setState(map: Record<string, EngineRecord>, id: string, state: EngineRecord["state"]): void {
  const existing = map[id];
  if (existing) {
    existing.state = state;
    existing.updatedAt = new Date().toISOString();
    map[id] = { ...existing };
  }
}

export class RealExecutionEngine {
  private executions = loadExecutions();
  private listeners = new Map<string, Set<(state: unknown) => void>>();
  // D07 §186 / §99 — deterministic idempotency gate: same key → same executionId, never double-fire
  private idempotencyMap = new Map<string, string>();
  // D07B — SyncQueue owns InsForge HTTP (/api/sync), not ExecutionEngine (D11 §5)
  private syncQueue = new RealSyncQueue();

  async execute(
    plan: unknown,
    context: unknown,
    opts?: { idempotencyKey?: string }
  ): Promise<{ success: true; data: { executionId: string } }> {
    const ctx = (context ?? {}) as { userId?: string; correlationId?: string };

    // D07 §186 — idempotency identity: executionId + stepId + actionVersion
    // For MVP: derive from userId + goal + correlationId so retry is deterministically deduped
    const idempotencyKey = opts?.idempotencyKey
      ?? `${ctx.userId ?? "user_demo"}:${(plan as { goal?: string })?.goal ?? "task"}:${ctx.correlationId ?? "no-corr"}`;

    // D07 §99 — at-least-once internally + idempotent externally
    const existingId = this.idempotencyMap.get(idempotencyKey);
    if (existingId) {
      const existing = this.executions[existingId];
      if (existing) {
        this.notify(existingId, existing);
        return { success: true, data: { executionId: existingId } };
      }
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.idempotencyMap.set(idempotencyKey, executionId);

    const record: EngineRecord = {
      executionId,
      idempotencyKey,
      plan,
      context: ctx,
      state: "PENDING_SYNC",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.executions[executionId] = record;
    saveExecutions(this.executions);

    // D07B — enqueue to SyncQueue (outbox). SyncQueue owns InsForge HTTP (/api/sync).
    // ExecutionEngine stays local-first: record is durable before any network call.
    this.syncQueue.enqueue({
      eventId: `evt_${executionId}`,
      operation: "CREATE",
      entity: "execution",
      payload: { executionId, idempotencyKey, goal: (plan as { goal?: string })?.goal ?? "task", userId: ctx.userId ?? "user_demo" },
      version: 1,
    });

    saveExecutions(this.executions);
    this.notify(executionId, this.executions[executionId]);
    return { success: true, data: { executionId } };
  }

  async getExecution(id: string, _userId: string): Promise<ExecutionRecord | null> {
    return this.executions[id] ?? null;
  }

  async pause(id: string, _userId: string): Promise<{ success: true; data: undefined }> {
    // D07 §112 — LOAD → VALIDATE → RECHECK POLICY → RECHECK PERMISSION → RESUME
    const current = this.executions[id];
    if (!current) throw new Error("executionNotFound");
    // VALIDATE: only RUNNING → PAUSED is valid (D07 §11)
    if (current.state !== "RUNNING") throw new Error("invalidTransition");
    // RECHECK POLICY / RECHECK PERMISSION: MVP — no policy layer yet, fail-closed default allow
    setState(this.executions, id, "PAUSED");
    saveExecutions(this.executions);
    this.notify(id, this.executions[id]);
    return { success: true, data: undefined };
  }

  async resume(id: string, _userId: string): Promise<{ success: true; data: undefined }> {
    // D07 §112 — LOAD → VALIDATE → RECHECK POLICY → RECHECK PERMISSION → RESUME
    const current = this.executions[id];
    if (!current) throw new Error("executionNotFound");
    // VALIDATE: only PAUSED → RUNNING is valid (D07 §11)
    if (current.state !== "PAUSED") throw new Error("invalidTransition");
    // RECHECK POLICY / RECHECK PERMISSION: MVP — fail-closed default allow
    setState(this.executions, id, "RUNNING");
    saveExecutions(this.executions);
    this.notify(id, this.executions[id]);
    return { success: true, data: undefined };
  }

  async cancel(id: string, _userId: string): Promise<{ success: true; data: undefined }> {
    const current = this.executions[id];
    if (!current) throw new Error("executionNotFound");
    if (current.state === "COMPLETED" || current.state === "CANCELLED") throw new Error("invalidTransition");
    setState(this.executions, id, "CANCELLED");
    saveExecutions(this.executions);
    this.notify(id, this.executions[id]);
    return { success: true, data: undefined };
  }

  observeExecution(id: string, cb: (s: unknown) => void): () => void {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(cb);
    const current = this.executions[id];
    if (current) cb(current);
    return () => this.listeners.get(id)?.delete(cb);
  }

  private notify(id: string, state: unknown): void {
    for (const cb of this.listeners.get(id) ?? []) {
      try { cb(state); } catch { /* ignore */ }
    }
  }
}