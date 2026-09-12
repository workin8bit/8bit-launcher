/**
 * D09 §23 — D07A Scheduler Adapter
 */

import type { Result } from "../types/ApplicationTypes";

export interface SchedulerAdapter {
  schedule(plan: unknown, context: unknown, opts?: { priority?: string; lifecycle?: string }): Promise<Result<{ executionId: string }>>;
  cancelSchedule(executionId: string, userId: string): Promise<Result<void>>;
  pauseSchedule(executionId: string, userId: string): Promise<Result<void>>;
  resumeSchedule(executionId: string, userId: string): Promise<Result<void>>;
  getSchedule(executionId: string, userId: string): Promise<Result<unknown>>;
  observeSchedule(callback: (state: unknown) => void): () => void;
}

export class FakeSchedulerAdapter implements SchedulerAdapter {
  async schedule(): Promise<Result<{ executionId: string }>> { return { success: true, data: { executionId: `sched_${Date.now()}` } }; }
  async cancelSchedule(): Promise<Result<void>> { return { success: true, data: undefined }; }
  async pauseSchedule(): Promise<Result<void>> { return { success: true, data: undefined }; }
  async resumeSchedule(): Promise<Result<void>> { return { success: true, data: undefined }; }
  async getSchedule(): Promise<Result<unknown>> { return { success: true, data: { queued: 0 } }; }
  observeSchedule(): () => void { return () => {}; }
}
