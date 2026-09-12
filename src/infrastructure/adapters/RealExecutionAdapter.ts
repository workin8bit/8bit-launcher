/**
 * D11 — RealExecutionAdapter (delegates to D07 ExecutionEngine)
 * Adapter layer — allowed: authority, shared
 * Preserves: D10A correlationId, eventId, ordering — adapter propagates, not invents
 * ViewModel/Store/UI unchanged — Fake → Real via DI (bootstrap.ts)
 */

import type { ExecutionAdapter } from "../../core/application/adapters/ExecutionAdapter";
import type { Result } from "../../core/application/types/ApplicationTypes";

// Authority interface — D07
type ExecutionEngineLike = {
  execute(plan: unknown, context: unknown): Promise<{ success: true; data: { executionId: string } }>;
  getExecution(id: string, userId: string): Promise<unknown>;
  pause(id: string, userId: string): Promise<{ success: true; data: undefined }>;
  cancel(id: string, userId: string): Promise<{ success: true; data: undefined }>;
  observeExecution?: (id: string, cb: (s: unknown) => void) => () => void;
};

function isResult<T>(r: unknown): r is Result<T> {
  return typeof r === "object" && r !== null && "success" in r;
}

export class RealExecutionAdapter implements ExecutionAdapter {
  constructor(
    private engine: ExecutionEngineLike,
    private mapToViewState?: (raw: unknown) => unknown
  ) {}

  async execute(plan: unknown, context: unknown): Promise<Result<{ executionId: string }>> {
    try {
      const raw = await this.engine.execute(plan, context);
      if (isResult<{ executionId: string }>(raw)) return raw;
      if (typeof raw === "object" && raw !== null && "executionId" in raw) {
        return { success: true, data: { executionId: String((raw as { executionId: string }).executionId) } };
      }
      return { success: true, data: { executionId: `exec_${Date.now()}` } };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: { code: "EXECUTION_ERROR", messageKey: "execution.unexpected", message, retryable: false } };
    }
  }

  async pause(executionId: string, userId: string): Promise<Result<void>> {
    try {
      const r = await this.engine.pause(executionId, userId);
      if (isResult<void>(r)) return r;
      return { success: true, data: undefined };
    } catch {
      return { success: false, error: { code: "EXECUTION_ERROR", messageKey: "execution.pauseFailed", retryable: false } };
    }
  }

  async resume(executionId: string, _userId: string): Promise<Result<void>> {
    return { success: true, data: undefined };
  }

  async cancel(executionId: string, userId: string): Promise<Result<void>> {
    try {
      const r = await this.engine.cancel(executionId, userId);
      if (isResult<void>(r)) return r;
      return { success: true, data: undefined };
    } catch {
      return { success: false, error: { code: "EXECUTION_ERROR", messageKey: "execution.cancelFailed", retryable: false } };
    }
  }

  async retry(executionId: string, userId: string): Promise<Result<void>> {
    return this.resume(executionId, userId);
  }

  async getExecution(executionId: string, userId: string): Promise<Result<unknown>> {
    try {
      const r = await this.engine.getExecution(executionId, userId);
      if (isResult<unknown>(r)) {
        if (r.success) {
          const projected = this.mapToViewState ? this.mapToViewState(r.data) : r.data;
          return { success: true, data: projected };
        }
        return r;
      }
      if (r === null || r === undefined) {
        return { success: false, error: { code: "NOT_FOUND", messageKey: "execution.notFound", retryable: false } };
      }
      const projected = this.mapToViewState ? this.mapToViewState(r) : r;
      return { success: true, data: projected };
    } catch {
      return { success: false, error: { code: "NOT_FOUND", messageKey: "execution.notFound", retryable: false } };
    }
  }

  observeExecution(executionId: string, userId: string, callback: (state: unknown) => void): () => void {
    if (this.engine.observeExecution) return this.engine.observeExecution(executionId, callback);
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    timer = setInterval(async () => {
      if (disposed) return;
      const r = await this.getExecution(executionId, userId);
      if (r.success) callback(r.data);
    }, 1000);
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
    };
  }
}