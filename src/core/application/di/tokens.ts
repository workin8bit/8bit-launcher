/**
 * D09 §27-28 — DI Tokens (explicit, no hard-coded singleton)
 */

export const TOKENS = {
  // Adapters (authorities)
  ExecutionAdapter: Symbol("ExecutionAdapter"),
  SchedulerAdapter: Symbol("SchedulerAdapter"),
  SyncAdapter: Symbol("SyncAdapter"),
  MemoryAdapter: Symbol("MemoryAdapter"),
  AndroidAdapter: Symbol("AndroidAdapter"),

  // Services
  ExecutionService: Symbol("ExecutionService"),
  SchedulerService: Symbol("SchedulerService"),
  SyncService: Symbol("SyncService"),
  MemoryService: Symbol("MemoryService"),
  AndroidService: Symbol("AndroidService"),

  // Facade
  ApplicationFacade: Symbol("ApplicationFacade"),

  // Stores
  ExecutionViewStore: Symbol("ExecutionViewStore"),
  SyncViewStore: Symbol("SyncViewStore"),

  // EventBus
  EventBus: Symbol("EventBus"),

  // Clock (for determinism D07 §155)
  Clock: Symbol("Clock"),
} as const;
