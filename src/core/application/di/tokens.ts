/**
 * D09 §27-28, D11 §5 — DI Tokens (explicit, no hard-coded singleton)
 * D11 adds Authority & Infrastructure tokens for Real Adapter injection
 */

export const TOKENS = {
  // Adapters (stable boundary — Fake or Real)
  ExecutionAdapter: Symbol("ExecutionAdapter"),
  SchedulerAdapter: Symbol("SchedulerAdapter"),
  SyncAdapter: Symbol("SyncAdapter"),
  MemoryAdapter: Symbol("MemoryAdapter"),
  AndroidAdapter: Symbol("AndroidAdapter"),

  // Authorities (D05–D07B) — injected into Real Adapters only via bootstrap
  ExecutionEngine: Symbol("ExecutionEngine"), // D07
  ExecutionRepository: Symbol("ExecutionRepository"),
  Scheduler: Symbol("Scheduler"), // D07A
  SyncQueue: Symbol("SyncQueue"), // D07B
  SyncTransport: Symbol("SyncTransport"), // D07B InsForge transport
  MemoryRepository: Symbol("MemoryRepository"), // D05
  EmbeddingService: Symbol("EmbeddingService"), // D05
  NativeBridge: Symbol("NativeBridge"), // D06

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

  // EventBus (D09) + InteractionBus (D10A)
  EventBus: Symbol("EventBus"),
  InteractionBus: Symbol("InteractionBus"),

  // Clock (for determinism D07 §155)
  Clock: Symbol("Clock"),
} as const;
