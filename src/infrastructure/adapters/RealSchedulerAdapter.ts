/**
 * D11 — RealSchedulerAdapter (stub — delegates to D07A Scheduler)
 * Adapter translates priority only — D07A owns scheduling semantics
 */

import type { SchedulerAdapter } from "../../core/application/adapters/SchedulerAdapter";
import type { Result } from "../../core/application/types/ApplicationTypes";

type SchedulerLike = {
  schedule(plan: unknown, context: unknown, opts?: { priority?: string; lifecycle?: string }): Promise<{ executionId: string }>;
  cancelSchedule(executionId: string, userId: string): Promise<void>;
  pauseSchedule(executionId: string, userId: string): Promise<void>;
  resumeSchedule(executionId: string, userId: string): Promise<void>;
  getSchedule(executionId: string, userId: string): Promise<unknown>;
  observeSchedule(cb: (state: unknown) => void): () => void;
};

export class RealSchedulerAdapter implements SchedulerAdapter {
  constructor(private scheduler: SchedulerLike) {}

  async schedule(plan: unknown, context: unknown, opts?: { priority?: string; lifecycle?: string }): Promise<Result<{ executionId: string }>> {
    try {
      const data = await this.scheduler.schedule(plan, context, opts);
      return { success: true, data };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: { code: "SCHEDULER_ERROR", messageKey: "scheduler.scheduleFailed", message, retryable: true } };
    }
  }

  async cancelSchedule(executionId: string, userId: string): Promise<Result<void>> {
    try {
      await this.scheduler.cancelSchedule(executionId, userId);
      return { success: true, data: undefined };
    } catch {
      return { success: false, error: { code: "SCHEDULER_ERROR", messageKey: "scheduler.cancelFailed", retryable: false } };
    }
  }

  async pauseSchedule(executionId: string, userId: string): Promise<Result<void>> {
    try {
      await this.scheduler.pauseSchedule(executionId, userId);
      return { success: true, data: undefined };
    } catch {
      return { success: false, error: { code: "SCHEDULER_ERROR", messageKey: "scheduler.pauseFailed", retryable: false } };
    }
  }

  async resumeSchedule(executionId: string, userId: string): Promise<Result<void>> {
    try {
      await this.scheduler.resumeSchedule(executionId, userId);
      return { success: true, data: undefined };
    } catch {
      return { success: false, error: { code: "SCHEDULER_ERROR", messageKey: "scheduler.resumeFailed", retryable: false } };
    }
  }

  async getSchedule(executionId: string, userId: string): Promise<Result<unknown>> {
    try {
      const data = await this.scheduler.getSchedule(executionId, userId);
      return { success: true, data };
    } catch {
      return { success: false, error: { code: "NOT_FOUND", messageKey: "scheduler.notFound", retryable: false } };
    }
  }

  observeSchedule(callback: (state: unknown) => void): () => void {
    return this.scheduler.observeSchedule(callback);
  }
}
