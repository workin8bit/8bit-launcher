/**
 * D09 §6-8 — ExecutionService (orchestration, delegation)
 * Service MUST delegate to D07, never invent execution logic
 * Service does NOT RUNNING→COMPLETED internally — asks D07
 */

import type { ApplicationCommand, Result, UserContext } from "../types/ApplicationTypes";
import type { ExecutionAdapter } from "../adapters/ExecutionAdapter";
import type { IEventBus } from "../events/EventBus";
import { createApplicationEvent } from "../events/ApplicationEvents";

export class ExecutionService {
  constructor(
    private executionAdapter: ExecutionAdapter,
    private eventBus: IEventBus
  ) {}

  async executeTask(command: ApplicationCommand<{ goal: string; priority?: string }>): Promise<Result<{ executionId: string }>> {
    // Application-level validation (not domain validation)
    if (!command.payload.goal?.trim()) {
      return { success: false, error: { code: "VALIDATION_ERROR", messageKey: "execution.goalRequired", retryable: false, correlationId: command.correlationId } };
    }

    // Delegate to authority D07 via adapter
    const result = await this.executionAdapter.execute({ goal: command.payload.goal }, { userId: command.userContext.userId });

    if (result.success) {
      this.eventBus.emit(createApplicationEvent("EXECUTION_UPDATED", { executionId: result.data.executionId }, command.userContext.userId, command.correlationId, result.data.executionId));
    }

    return result;
  }

  async cancelTask(command: ApplicationCommand<{ executionId: string }>): Promise<Result<void>> {
    return this.executionAdapter.cancel(command.payload.executionId, command.userContext.userId);
  }

  async pauseTask(command: ApplicationCommand<{ executionId: string }>): Promise<Result<void>> {
    return this.executionAdapter.pause(command.payload.executionId, command.userContext.userId);
  }

  async retryTask(command: ApplicationCommand<{ executionId: string }>): Promise<Result<void>> {
    return this.executionAdapter.retry(command.payload.executionId, command.userContext.userId);
  }

  async getExecution(query: { executionId: string; userContext: UserContext }): Promise<Result<unknown>> {
    return this.executionAdapter.getExecution(query.executionId, query.userContext.userId);
  }

  // ── D07B worker (delegates to adapter; Fake adapter no-ops) ──
  startWorker(userId: string, intervalMs = 5000): void {
    const adapter = this.executionAdapter as unknown as { startWorker?: (u: string, ms?: number) => void };
    if (adapter?.startWorker) adapter.startWorker(userId, intervalMs);
  }

  async processPending(userId: string): Promise<unknown[]> {
    const adapter = this.executionAdapter as unknown as { processPending?: (u: string) => Promise<unknown[]> };
    if (adapter?.processPending) return adapter.processPending(userId);
    return [];
  }
}
