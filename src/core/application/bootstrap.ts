/**
 * D09 §89-90, D11 §5 — Bootstrap (Load Config → DI → Session → Repositories → Adapters → Stores → Routing → Hydrate → READY)
 * D11: Fake → Real via DI — ViewModel/Store/UI unchanged
 * Only bootstrap.ts + di/* may `new Real*` (D09A di-only)
 * Commit 3: replace stub authorities with real implementations (InsForge/Vercel/Capacitor)
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

// Real authorities — D05/D06/D07/D07A/D07B
import { RealExecutionEngine } from "../../infrastructure/authorities/RealExecutionEngine";
import { RealExecutionRepository } from "../../infrastructure/authorities/RealExecutionRepository";
import { RealSyncQueue } from "../../infrastructure/authorities/RealSyncQueue";
import { RealMemoryRepository } from "../../infrastructure/authorities/RealMemoryRepository";
import { RealNativeBridge } from "../../infrastructure/authorities/RealNativeBridge";
import { RealScheduler } from "../../infrastructure/authorities/RealScheduler";

export type BootstrapEnv = "test" | "development" | "production";
export interface BootstrapOptions {
  env?: BootstrapEnv;
  overrides?: Partial<Record<symbol, unknown>>;
}

function resolveEnv(explicit?: BootstrapEnv): BootstrapEnv {
  if (explicit) return explicit;
  const nodeEnv = (typeof process !== "undefined" ? (process.env.NODE_ENV as string) : undefined) ?? "production";
  if (nodeEnv === "test") return "test";
  if (nodeEnv === "development") return "development";
  return "production";
}

export function bootstrapApplication(opts: BootstrapOptions = {}): { container: Container; facade: ApplicationFacade; env: BootstrapEnv } {
  const env = resolveEnv(opts.env);
  const container = createApplicationContainer();

  // 1. Buses — shared
  const eventBus = new InMemoryEventBus();
  const interactionBus = new InMemoryInteractionBus();
  container.registerInstance(TOKENS.EventBus, eventBus);
  container.registerInstance(TOKENS.InteractionBus, interactionBus);
  container.registerInstance(TOKENS.Clock, { now: () => new Date().toISOString() });

  // 2. Real authorities — D05/D06/D07/D07A/D07B (only in non-test env)
  if (env !== "test") {
    container.registerInstance(TOKENS.ExecutionEngine, new RealExecutionEngine());
    container.registerInstance(TOKENS.ExecutionRepository, new RealExecutionRepository());
    container.registerInstance(TOKENS.SyncQueue, new RealSyncQueue());
    container.registerInstance(TOKENS.SyncTransport, {}); // transport is inside SyncQueue
    container.registerInstance(TOKENS.MemoryRepository, new RealMemoryRepository());
    container.registerInstance(TOKENS.EmbeddingService, {}); // keyword-only fallback
    container.registerInstance(TOKENS.NativeBridge, new RealNativeBridge());
    container.registerInstance(TOKENS.Scheduler, new RealScheduler());
  }

  // 3. Adapters — D11 DI switch: test → Fake, prod/dev → Real (same contract)
  if (env === "test") {
    container.registerInstance(TOKENS.ExecutionAdapter, new FakeExecutionAdapter());
    container.registerInstance(TOKENS.SchedulerAdapter, new FakeSchedulerAdapter());
    container.registerInstance(TOKENS.SyncAdapter, new FakeSyncAdapter());
    container.registerInstance(TOKENS.MemoryAdapter, new FakeMemoryAdapter());
    container.registerInstance(TOKENS.AndroidAdapter, new FakeAndroidAdapter());
  } else {
    container.registerInstance(
      TOKENS.ExecutionAdapter,
      new RealExecutionAdapter(
        container.resolve(TOKENS.ExecutionEngine) as never,
        container.resolve(TOKENS.ExecutionRepository) as never
      )
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

  // Allow overrides for adapters (contract tests)
  if (opts.overrides?.[TOKENS.ExecutionAdapter]) container.registerInstance(TOKENS.ExecutionAdapter, opts.overrides[TOKENS.ExecutionAdapter] as never);
  if (opts.overrides?.[TOKENS.SyncAdapter]) container.registerInstance(TOKENS.SyncAdapter, opts.overrides[TOKENS.SyncAdapter] as never);
  if (opts.overrides?.[TOKENS.MemoryAdapter]) container.registerInstance(TOKENS.MemoryAdapter, opts.overrides[TOKENS.MemoryAdapter] as never);
  if (opts.overrides?.[TOKENS.AndroidAdapter]) container.registerInstance(TOKENS.AndroidAdapter, opts.overrides[TOKENS.AndroidAdapter] as never);
  if (opts.overrides?.[TOKENS.SchedulerAdapter]) container.registerInstance(TOKENS.SchedulerAdapter, opts.overrides[TOKENS.SchedulerAdapter] as never);

  // 4. Services — orchestration, delegation only — unchanged
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

  // 5. Stores — presentation state only
  container.registerInstance(TOKENS.ExecutionViewStore, new ExecutionViewStore());
  container.registerInstance(TOKENS.SyncViewStore, new SyncViewStore());

  // 6. Facade — stable boundary — unchanged
  const facade = new ApplicationFacade(executionService, schedulerService, syncService, memoryService, androidService);
  container.registerInstance(TOKENS.ApplicationFacade, facade);

  return { container, facade, env };
}

// Convenience for tests
export function bootstrapTest(overrides?: BootstrapOptions["overrides"]) {
  return bootstrapApplication({ env: "test", overrides });
}
export function bootstrapProduction(overrides?: BootstrapOptions["overrides"]) {
  return bootstrapApplication({ env: "production", overrides });
}