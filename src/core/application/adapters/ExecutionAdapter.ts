/**
 * D09 §21-22 — D07 Adapter (Execution Authority)
 * Translates D07 ExecutionEngine → Application Service
 * Does NOT redefine authority semantics
 */

import type { Result } from "../types/ApplicationTypes";

export interface ExecutionAdapter {
  execute(plan: unknown, context: unknown): Promise<Result<{ executionId: string }>>;
  pause(executionId: string, userId: string): Promise<Result<void>>;
  resume(executionId: string, userId: string): Promise<Result<void>>;
  cancel(executionId: string, userId: string): Promise<Result<void>>;
  retry(executionId: string, userId: string): Promise<Result<void>>;
  getExecution(executionId: string, userId: string): Promise<Result<unknown>>;
  observeExecution(executionId: string, userId: string, callback: (state: unknown) => void): () => void;
}

// Fake for scaffolding/tests — real implementation injects D07 ExecutionEngine
export class FakeExecutionAdapter implements ExecutionAdapter {
  private executions = new Map<string, unknown>();
  async execute(_plan: unknown, _ctx: unknown): Promise<Result<{ executionId: string }>> {
    const id = `exec_${Date.now()}`;
    this.executions.set(id, { executionId: id, state: "RUNNING" });
    return { success: true, data: { executionId: id } };
  }
  async pause(executionId: string): Promise<Result<void>> { return { success: true, data: undefined }; }
  async resume(executionId: string): Promise<Result<void>> { return { success: true, data: undefined }; }
  async cancel(executionId: string): Promise<Result<void>> { return { success: true, data: undefined }; }
  async retry(executionId: string): Promise<Result<void>> { return { success: true, data: undefined }; }
  async getExecution(executionId: string): Promise<Result<unknown>> {
    const e = this.executions.get(executionId);
    if (!e) return { success: false, error: { code: "NOT_FOUND", messageKey: "execution.notFound", retryable: false } };
    return { success: true, data: e };
  }
  observeExecution(_id: string, _userId: string, _cb: (s: unknown) => void): () => void { return () => {}; }

  // D07B worker — Fake no-op (Real adapter delegates to engine)
  startWorker(_userId: string, _intervalMs = 5000): void { /* no-op */ }
  async processPending(_userId: string): Promise<unknown[]> { return []; }
}
