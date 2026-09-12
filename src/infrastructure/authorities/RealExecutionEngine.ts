/**
 * D11 — RealExecutionEngine (D07 authority)
 * Delegates to InsForge serverless execution + local-first persistence
 * Durable: localStorage for process-death recovery
 */

const EXECUTIONS_KEY = "8bitai_executions_v1";

interface ExecutionRecord {
  executionId: string;
  plan: unknown;
  context: { userId?: string };
  state: "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELLED" | "PENDING_SYNC";
  createdAt: string;
}

function loadExecutions(): Record<string, ExecutionRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXECUTIONS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ExecutionRecord>;
  } catch { return {}; }
}

function saveExecutions(map: Record<string, ExecutionRecord>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(EXECUTIONS_KEY, JSON.stringify(map)); } catch { /* skip */ }
}

function setState(map: Record<string, ExecutionRecord>, id: string, state: ExecutionRecord["state"]): void {
  const existing = map[id];
  if (existing) {
    existing.state = state;
    map[id] = { ...existing };
  }
}

const INSFORGE_URL = "https://4m4ujzk7.ap-southeast.insforge.app";
const INSFORGE_ANON_KEY = "ik_49de6e3f03e9c9e54042887997fbdf22";

export class RealExecutionEngine {
  private executions = loadExecutions();
  private listeners = new Map<string, Set<(state: unknown) => void>>();

  async execute(plan: unknown, context: unknown): Promise<{ success: true; data: { executionId: string } }> {
    const ctx = context as { userId?: string };
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: ExecutionRecord = {
      executionId,
      plan,
      context: ctx,
      state: "RUNNING",
      createdAt: new Date().toISOString(),
    };

    this.executions[executionId] = record;
    saveExecutions(this.executions);

    try {
      const res = await fetch(`${INSFORGE_URL}/api/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${INSFORGE_ANON_KEY}`,
        },
        body: JSON.stringify({
          goal: (plan as { goal?: string })?.goal ?? "task",
          userId: ctx?.userId ?? "user_demo",
        }),
      });

      setState(this.executions, executionId, res.ok ? "COMPLETED" : "FAILED");
    } catch {
      setState(this.executions, executionId, "PENDING_SYNC");
    }

    saveExecutions(this.executions);
    this.notify(executionId, this.executions[executionId]);
    return { success: true, data: { executionId } };
  }

  async getExecution(id: string, _userId: string): Promise<ExecutionRecord | null> {
    return this.executions[id] ?? null;
  }

  async pause(id: string, _userId: string): Promise<{ success: true; data: undefined }> {
    setState(this.executions, id, "PAUSED");
    saveExecutions(this.executions);
    this.notify(id, this.executions[id]);
    return { success: true, data: undefined };
  }

  async cancel(id: string, _userId: string): Promise<{ success: true; data: undefined }> {
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