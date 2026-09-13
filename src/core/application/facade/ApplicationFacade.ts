/**
 * D09 §5, §71-72, §111-112 — Application Facade (stable boundary)
 * Single entry point for frontend commands/queries
 * Facade is orchestration, not God Object — delegates to services
 */

import type { Result, UserContext } from "../types/ApplicationTypes";
import { createCommand, createQuery } from "../types/ApplicationTypes";
import type { ExecutionService } from "../services/ExecutionService";
import type { SyncService } from "../services/SyncService";
import type { MemoryService } from "../services/MemoryService";
import type { AndroidService } from "../services/AndroidService";
import type { SchedulerService } from "../services/SchedulerService";
import type { DashboardViewState, SyncStatus, AndroidAppInfo } from "../types/ProjectionTypes";

export class ApplicationFacade {
  constructor(
    private executionService: ExecutionService,
    private schedulerService: SchedulerService,
    private syncService: SyncService,
    private memoryService: MemoryService,
    private androidService: AndroidService
  ) {}

  // ── Commands ──
  async executeTask(goal: string, userContext: UserContext): Promise<Result<{ executionId: string }>> {
    const cmd = createCommand("ExecuteTask", { goal }, userContext);
    return this.executionService.executeTask(cmd);
  }

  async cancelTask(executionId: string, userContext: UserContext): Promise<Result<void>> {
    const cmd = createCommand("CancelTask", { executionId }, userContext);
    return this.executionService.cancelTask(cmd);
  }

  async pauseTask(executionId: string, userContext: UserContext): Promise<Result<void>> {
    const cmd = createCommand("PauseTask", { executionId }, userContext);
    return this.executionService.pauseTask(cmd);
  }

  async createMemory(content: string, type: string, userContext: UserContext): Promise<Result<{ id: string }>> {
    const cmd = createCommand("CreateMemory", { content, type }, userContext);
    return this.memoryService.createMemory(cmd);
  }

  async openAndroidApp(packageName: string, userContext: UserContext): Promise<Result<void>> {
    const cmd = createCommand("OpenAndroidApp", { packageName }, userContext);
    return this.androidService.openApp(cmd);
  }

  // ── Queries ──
  async getExecution(executionId: string, userContext: UserContext): Promise<Result<unknown>> {
    const qry = createQuery("GetExecution", { executionId }, userContext);
    return this.executionService.getExecution({ executionId: qry.parameters.executionId, userContext });
  }

  async getSyncStatus(userContext: UserContext): Promise<Result<SyncStatus>> {
    return this.syncService.getSyncStatus(userContext);
  }

  async getDashboard(userContext: UserContext): Promise<Result<DashboardViewState>> {
    // D09 §135-136 — Dashboard is composition, not authority
    const [syncRes, appsRes] = await Promise.all([
      this.syncService.getSyncStatus(userContext),
      this.androidService.getInstalledApps(userContext.userId),
    ]);

    if (!syncRes.success) return { success: false, error: { code: "UNKNOWN", messageKey: "dashboard.loadFailed", retryable: true } };

    // Aggregate projection — no business logic duplication
    return {
      success: true,
      data: {
        execution: { active: 0, failed: 0 }, // would query execution store
        sync: {
          status: syncRes.data.status as DashboardViewState["sync"]["status"],
          pendingCount: syncRes.data.pendingCount,
          syncingCount: syncRes.data.syncingCount,
          failedCount: syncRes.data.failedCount,
          conflictCount: syncRes.data.conflictCount,
          lastSyncAt: syncRes.data.lastSyncAt,
          canRetry: syncRes.data.failedCount > 0,
        },
        scheduler: { queued: 0, scheduled: 0, running: 0, retryDelay: 0, paused: 0 },
        recentActivity: [],
        isLoading: false,
      },
    };
  }

  async searchMemory(query: string, userContext: UserContext): Promise<Result<unknown[]>> {
    return this.memoryService.searchMemory(userContext.userId, query);
  }

  async getInstalledApps(userContext: UserContext): Promise<Result<AndroidAppInfo[]>> {
    return this.androidService.getInstalledApps(userContext.userId);
  }

  // ── Subscriptions (for Stores/ViewModels) ──
  observeSync(userContext: UserContext, callback: (status: SyncStatus) => void): () => void {
    return this.syncService.observeSync(userContext, callback);
  }

  // ── D07B worker (Android: poll /api/sync → execute native → ack /api/sync/ack) ──
  // New methods — NOT part of the stable adapter contract. Web: degrade. Android: execute native.
  startWorker(userId: string, intervalMs = 5000): void {
    this.executionService.startWorker(userId, intervalMs);
  }

  async processPending(userId: string): Promise<unknown[]> {
    return this.executionService.processPending(userId);
  }
}
