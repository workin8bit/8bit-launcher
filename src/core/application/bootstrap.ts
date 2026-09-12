/**
 * D09 §89-90, D11 §5 — Bootstrap (Load Config → DI → Session → Repositories → Adapters → Stores → Routing → Hydrate → READY)
 * D11: Fake → Real via DI — ViewModel/Store/UI unchanged
 * Only bootstrap.ts + di/* may `new Real*` (D09A di-only)
 */

import { Container, createApplicationContainer } from "./di/Container";
import { TOKENS } from "./di/tokens";
import { InMemoryEventBus } from "./events/EventBus";
import { FakeExecutionAdapter } from "./adapters/ExecutionAdapter";
import { FakeSchedulerAdapter } from "./adapters/SchedulerAdapter";
import { FakeSyncAdapter } from "./adapters/SyncAdapter";
import { FakeMemoryAdapter } from "./adapters/MemoryAdapter";
import { FakeAndroidAdapter } from "./adapters/AndroidAdapter";
import { ExecutionService } from "./services/ExecutionService";
import { SchedulerService } from "./services/SchedulerService";
import { SyncService } from "./services/SyncService";
import { MemoryService } from "./services/MemoryService";
import { AndroidService } from "./services/AndroidService";
import { ApplicationFacade } from "./facade/ApplicationFacade";
import { ExecutionViewStore } from "./stores/ExecutionViewStore";
import { SyncViewStore } from "./stores/SyncViewStore";
import { InMemoryInteractionBus } from "./interaction/InteractionBus";

// Real adapters — D11 (infrastructure) — same contracts, Real delegates to authority
import { RealExecutionAdapter } from "../../infrastructure/adapters/RealExecutionAdapter";
import { RealSyncAdapter } from "../../infrastructure/adapters/RealSyncAdapter";
import { RealMemoryAdapter } from "../../infrastructure/adapters/RealMemoryAdapter";
import { RealAndroidAdapter } from "../../infrastructure/adapters/RealAndroidAdapter";
import { RealSchedulerAdapter } from "../../infrastructure/adapters/RealSchedulerAdapter";

export type BootstrapEnv = "test" | "development" | "production";
export interface BootstrapOptions {
  env?: BootstrapEnv;
  // Allow test to inject custom authorities — still via DI, not ViewModel
  overrides?: Partial<Record<symbol, unknown>>;
}

function resolveEnv(explicit?: BootstrapEnv): BootstrapEnv {
  if (explicit) return explicit;
  // Node / Vite / Next — prefer explicit, fallback to NODE_ENV
  const nodeEnv = (typeof process !== "undefined" ? (process.env.NODE_ENV as string) : undefined) ?? "production";
  if (nodeEnv === "test") return "test";
  if (nodeEnv === "development") return "development";
  return "production";
}

// Minimal in-memory authorities for stub Real adapters (so Real path works without full D05–D07B implementation)
// In production these will be replaced by real InsForge/NativeBridge/SyncQueue
function createStubAuthorities() {
  const syncStatus = { status: "SYNCED" as const, pendingCount: 0, syncingCount: 0, failedCount: 0, conflictCount: 0, lastSyncAt: new Date().toISOString() };
  return {
    // D07 Execution — stub that satisfies ExecutionEngineLike
    executionEngine: {
      async execute() { return { success: true as const, data: { executionId: `exec_${Date.now()}` } }; },
      async getExecution() { return null; },
      async pause() { return { success: true as const, data: undefined }; },
      async cancel() { return { success: true as const, data: undefined }; },
    },
    // D07B Sync — stub
    syncQueue: {
      async getStatus() { return { ...syncStatus }; },
      observeStatus(_userId: string, _cb: (s: typeof syncStatus) => void) { return () => {}; },
      async flush() {},
      async getPending() { return []; },
      async getConflicts() { return []; },
    },
    syncTransport: {},
    // D05 Memory — stub
    memoryRepository: {
      async create(payload: { content: string; type: string; userId: string }) { return { id: `mem_${Date.now()}` }; },
      async search() { return []; },
      async read() { return null; },
      async delete() {},
      async getContext() { return {}; },
    },
    embeddingService: {},
    // D06 Android — stub
    nativeBridge: {
      async getInstalledApps() { return [{ packageName: "com.android.chrome", label: "Chrome", launchable: true }]; },
      async openApp() {},
      async getPermissionState() { return { state: "GRANTED" as const }; },
      observeLifecycle() { return () => {}; },
    },
    // D07A Scheduler — stub
    scheduler: {
      async schedule() { return { executionId: `sched_${Date.now()}` }; },
      async cancelSchedule() {},
      async pauseSchedule() {},
      async resumeSchedule() {},
      async getSchedule() { return { queued: 0 }; },
      observeSchedule() { return () => {}; },
    },
  };
}

export function bootstrapApplication(opts: BootstrapOptions = {}): { container: Container; facade: ApplicationFacade; env: BootstrapEnv } {
  const env = resolveEnv(opts.env);
  const container = createApplicationContainer();
  const stubs = createStubAuthorities();

  // 1. Buses — shared
  const eventBus = new InMemoryEventBus();
  const interactionBus = new InMemoryInteractionBus();
  container.registerInstance(TOKENS.EventBus, eventBus);
  container.registerInstance(TOKENS.InteractionBus, interactionBus);
  container.registerInstance(TOKENS.Clock, { now: () => new Date().toISOString() });

  // Register stub authorities so Real adapters can resolve them via DI
  container.registerInstance(TOKENS.ExecutionEngine, opts.overrides?.[TOKENS.ExecutionEngine] ?? stubs.executionEngine);
  container.registerInstance(TOKENS.SyncQueue, opts.overrides?.[TOKENS.SyncQueue] ?? stubs.syncQueue);
  container.registerInstance(TOKENS.SyncTransport, opts.overrides?.[TOKENS.SyncTransport] ?? stubs.syncTransport);
  container.registerInstance(TOKENS.MemoryRepository, opts.overrides?.[TOKENS.MemoryRepository] ?? stubs.memoryRepository);
  container.registerInstance(TOKENS.EmbeddingService, opts.overrides?.[TOKENS.EmbeddingService] ?? stubs.embeddingService);
  container.registerInstance(TOKENS.NativeBridge, opts.overrides?.[TOKENS.NativeBridge] ?? stubs.nativeBridge);
  container.registerInstance(TOKENS.Scheduler, opts.overrides?.[TOKENS.Scheduler] ?? stubs.scheduler);

  // 2. Adapters — D11 DI switch: test → Fake, prod/dev → Real (same contract)
  if (env === "test") {
    container.registerInstance(TOKENS.ExecutionAdapter, new FakeExecutionAdapter());
    container.registerInstance(TOKENS.SchedulerAdapter, new FakeSchedulerAdapter());
    container.registerInstance(TOKENS.SyncAdapter, new FakeSyncAdapter());
    container.registerInstance(TOKENS.MemoryAdapter, new FakeMemoryAdapter());
    container.registerInstance(TOKENS.AndroidAdapter, new FakeAndroidAdapter());
  } else {
    container.registerInstance(
      TOKENS.ExecutionAdapter,
      new RealExecutionAdapter(container.resolve(TOKENS.ExecutionEngine) as never)
    );
    container.registerInstance(
      TOKENS.SyncAdapter,
      new RealSyncAdapter(container.resolve(TOKENS.SyncQueue) as never, container.resolve(TOKENS.SyncTransport) as never)
    );
    container.registerInstance(
      TOKENS.MemoryAdapter,
      new RealMemoryAdapter(container.resolve(TOKENS.MemoryRepository) as never)
    );
    container.registerInstance(
      TOKENS.AndroidAdapter,
      new RealAndroidAdapter(container.resolve(TOKENS.NativeBridge) as never)
    );
    container.registerInstance(
      TOKENS.SchedulerAdapter,
      new RealSchedulerAdapter(container.resolve(TOKENS.Scheduler) as never)
    );
  }

  // Allow overrides for adapters too (for contract tests that want to swap)
  if (opts.overrides?.[TOKENS.ExecutionAdapter]) container.registerInstance(TOKENS.ExecutionAdapter, opts.overrides[TOKENS.ExecutionAdapter] as never);
  if (opts.overrides?.[TOKENS.SyncAdapter]) container.registerInstance(TOKENS.SyncAdapter, opts.overrides[TOKENS.SyncAdapter] as never);
  if (opts.overrides?.[TOKENS.MemoryAdapter]) container.registerInstance(TOKENS.MemoryAdapter, opts.overrides[TOKENS.MemoryAdapter] as never);
  if (opts.overrides?.[TOKENS.AndroidAdapter]) container.registerInstance(TOKENS.AndroidAdapter, opts.overrides[TOKENS.AndroidAdapter] as never);
  if (opts.overrides?.[TOKENS.SchedulerAdapter]) container.registerInstance(TOKENS.SchedulerAdapter, opts.overrides[TOKENS.SchedulerAdapter] as never);

  // 3. Services — orchestration, delegation only — unchanged
  const executionService = new ExecutionService(container.resolve(TOKENS.ExecutionAdapter) as never, eventBus);
  const schedulerService = new SchedulerService(container.resolve(TOKENS.SchedulerAdapter) as never);
  const syncService = new SyncService(container.resolve(TOKENS.SyncAdapter) as never);
  const memoryService = new MemoryService(container.resolve(TOKENS.MemoryAdapter) as never);
  const androidService = new AndroidService(container.resolve(TOKENS.AndroidAdapter) as never);

  container.registerInstance(TOKENS.ExecutionService, executionService);
  container.registerInstance(TOKENS.SchedulerService, schedulerService);
  container.registerInstance(TOKENS.SyncService, syncService);
  container.registerInstance(TOKENS.MemoryService, memoryService);
  container.registerInstance(TOKENS.AndroidService, androidService);

  // 4. Stores — presentation state only
  container.registerInstance(TOKENS.ExecutionViewStore, new ExecutionViewStore());
  container.registerInstance(TOKENS.SyncViewStore, new SyncViewStore());

  // 5. Facade — stable boundary — unchanged
  const facade = new ApplicationFacade(executionService, schedulerService, syncService, memoryService, androidService);
  container.registerInstance(TOKENS.ApplicationFacade, facade);

  // 6. Hydration would happen here: query authorities → fill stores → READY
  // D09 §140 Hydration order: Session → UserContext → Critical → Feature → Non-critical

  return { container, facade, env };
}

// Convenience for tests
export function bootstrapTest(overrides?: BootstrapOptions["overrides"]) {
  return bootstrapApplication({ env: "test", overrides });
}
export function bootstrapProduction(overrides?: BootstrapOptions["overrides"]) {
  return bootstrapApplication({ env: "production", overrides });
}
