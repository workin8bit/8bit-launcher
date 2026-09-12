/**
 * D11 — RealExecutionRepository (D07 durable store)
 * Thin wrapper over the same localStorage map RealExecutionEngine uses.
 * Shares EXECUTIONS_KEY — no drift, no new storage (D11 §5).
 * D11 §5 diagram: new RealExecutionAdapter(engine, repository) — repository is required.
 */

export const EXECUTIONS_KEY = "8bitai_executions_v1";

export interface ExecutionRecord {
  executionId: string;
  idempotencyKey?: string;
  plan: unknown;
  context: { userId?: string; correlationId?: string };
  state: "CREATED" | "VALIDATING" | "READY" | "RUNNING" | "PAUSED" | "CANCELLED" | "COMPLETED" | "FAILED" | "PENDING_SYNC";
  createdAt: string;
  updatedAt: string;
}

function loadMap(): Record<string, ExecutionRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXECUTIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ExecutionRecord>) : {};
  } catch { return {}; }
}

function saveMap(map: Record<string, ExecutionRecord>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(EXECUTIONS_KEY, JSON.stringify(map)); } catch { /* skip */ }
}

export class RealExecutionRepository {
  private map = loadMap();

  get(id: string): ExecutionRecord | null {
    return this.map[id] ?? null;
  }

  put(record: ExecutionRecord): void {
    this.map[record.executionId] = record;
    saveMap(this.map);
  }

  list(userId: string): ExecutionRecord[] {
    return Object.values(this.map).filter(r => r.context?.userId === userId);
  }

  remove(id: string): void {
    delete this.map[id];
    saveMap(this.map);
  }
}