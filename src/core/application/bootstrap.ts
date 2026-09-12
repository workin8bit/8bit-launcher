/**
 * D09 §89-90 — Bootstrap (Load Config → DI → Session → Repositories → Adapters → Stores → Routing → Hydrate → READY)
 * Demonstrates correct wiring — no ViewModel creates Database
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

export function bootstrapApplication(): { container: Container; facade: ApplicationFacade } {
  const container = createApplicationContainer();

  // 1. Infrastructure — fakes for scaffolding, real impl in production
  const eventBus = new InMemoryEventBus();
  container.registerInstance(TOKENS.EventBus, eventBus);
  container.registerInstance(TOKENS.ExecutionAdapter, new FakeExecutionAdapter());
  container.registerInstance(TOKENS.SchedulerAdapter, new FakeSchedulerAdapter());
  container.registerInstance(TOKENS.SyncAdapter, new FakeSyncAdapter());
  container.registerInstance(TOKENS.MemoryAdapter, new FakeMemoryAdapter());
  container.registerInstance(TOKENS.AndroidAdapter, new FakeAndroidAdapter());
  container.registerInstance(TOKENS.Clock, { now: () => new Date().toISOString() });

  // 2. Services — orchestration, delegation only
  const executionService = new ExecutionService(container.resolve(TOKENS.ExecutionAdapter), eventBus);
  const schedulerService = new SchedulerService(container.resolve(TOKENS.SchedulerAdapter));
  const syncService = new SyncService(container.resolve(TOKENS.SyncAdapter));
  const memoryService = new MemoryService(container.resolve(TOKENS.MemoryAdapter));
  const androidService = new AndroidService(container.resolve(TOKENS.AndroidAdapter));

  container.registerInstance(TOKENS.ExecutionService, executionService);
  container.registerInstance(TOKENS.SchedulerService, schedulerService);
  container.registerInstance(TOKENS.SyncService, syncService);
  container.registerInstance(TOKENS.MemoryService, memoryService);
  container.registerInstance(TOKENS.AndroidService, androidService);

  // 3. Stores — presentation state only
  container.registerInstance(TOKENS.ExecutionViewStore, new ExecutionViewStore());
  container.registerInstance(TOKENS.SyncViewStore, new SyncViewStore());

  // 4. Facade — stable boundary
  const facade = new ApplicationFacade(executionService, schedulerService, syncService, memoryService, androidService);
  container.registerInstance(TOKENS.ApplicationFacade, facade);

  // 5. Hydration would happen here: query authorities → fill stores → READY
  // D09 §140 Hydration order: Session → UserContext → Critical → Feature → Non-critical

  return { container, facade };
}
