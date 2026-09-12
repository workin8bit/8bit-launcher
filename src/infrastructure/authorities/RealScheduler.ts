/**
 * D11 — RealScheduler (D07A authority)
 * Web: setTimeout-based scheduling with localStorage persistence
 * In production: WorkManager/AlarmManager via Capacitor plugin
 */

const SCHEDULES_KEY = "8bitai_schedules_v1";

interface ScheduledTask {
  executionId: string;
  plan: unknown;
  context: unknown;
  opts?: { priority?: string; lifecycle?: string };
  scheduledAt: string;
  status: "pending" | "running" | "completed" | "cancelled";
}

function loadSchedules(): ScheduledTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCHEDULES_KEY);
    return raw ? (JSON.parse(raw) as ScheduledTask[]) : [];
  } catch { return []; }
}

function saveSchedules(list: ScheduledTask[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(SCHEDULES_KEY, JSON.stringify(list)); } catch { /* skip */ }
}

export class RealScheduler {
  private schedules = loadSchedules();
  private listeners = new Set<(state: unknown) => void>();

  async schedule(
    plan: unknown,
    context: unknown,
    opts?: { priority?: string; lifecycle?: string }
  ): Promise<{ executionId: string }> {
    const executionId = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: ScheduledTask = {
      executionId,
      plan,
      context,
      opts,
      scheduledAt: new Date().toISOString(),
      status: "pending",
    };
    this.schedules.push(task);
    saveSchedules(this.schedules);
    this.notify();
    // Execute immediately in web mode (D07A MVP — sync execution)
    this.runImmediately(task);
    return { executionId };
  }

  private async runImmediately(task: ScheduledTask): Promise<void> {
    task.status = "running";
    saveSchedules(this.schedules);
    this.notify();
    try {
      // Delegate to execution engine via fetch
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: (task.plan as { goal?: string })?.goal ?? "scheduled task",
          userId: (task.context as { userId?: string })?.userId ?? "user_demo",
        }),
      });
      task.status = "completed";
    } catch {
      task.status = "pending"; // retry later
    }
    saveSchedules(this.schedules);
    this.notify();
  }

  async cancelSchedule(executionId: string, _userId: string): Promise<void> {
    const task = this.schedules.find(s => s.executionId === executionId);
    if (task) {
      task.status = "cancelled";
      saveSchedules(this.schedules);
      this.notify();
    }
  }

  async pauseSchedule(executionId: string, _userId: string): Promise<void> {
    const task = this.schedules.find(s => s.executionId === executionId);
    if (task) {
      task.status = "pending";
      saveSchedules(this.schedules);
      this.notify();
    }
  }

  async resumeSchedule(executionId: string, userId: string): Promise<void> {
    const task = this.schedules.find(s => s.executionId === executionId);
    if (task && task.status === "pending") {
      this.runImmediately(task);
    }
  }

  async getSchedule(executionId: string, _userId: string): Promise<unknown> {
    return this.schedules.find(s => s.executionId === executionId) ?? null;
  }

  observeSchedule(cb: (state: unknown) => void): () => void {
    this.listeners.add(cb);
    cb({ queued: this.schedules.filter(s => s.status === "pending").length });
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    const state = {
      queued: this.schedules.filter(s => s.status === "pending").length,
      running: this.schedules.filter(s => s.status === "running").length,
    };
    for (const cb of this.listeners) {
      try { cb(state); } catch { /* ignore */ }
    }
  }
}