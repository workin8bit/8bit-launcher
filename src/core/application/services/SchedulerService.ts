/**
 * D09 §6-8 — SchedulerService → D07A
 */

import type { ApplicationCommand, Result } from "../types/ApplicationTypes";
import type { SchedulerAdapter } from "../adapters/SchedulerAdapter";

export class SchedulerService {
  constructor(private schedulerAdapter: SchedulerAdapter) {}

  async scheduleTask(command: ApplicationCommand<{ goal: string; priority?: string }>): Promise<Result<{ executionId: string }>> {
    return this.schedulerAdapter.schedule({ goal: command.payload.goal }, { userId: command.userContext.userId }, { priority: command.payload.priority });
  }

  async cancelSchedule(command: ApplicationCommand<{ executionId: string }>): Promise<Result<void>> {
    return this.schedulerAdapter.cancelSchedule(command.payload.executionId, command.userContext.userId);
  }
}
