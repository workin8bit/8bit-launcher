/**
 * D09 — Frontend Application Contract — Barrel
 * Exports stable public API: facade is the boundary
 */

// Types
export * from "./types/ApplicationTypes";
export * from "./types/ProjectionTypes";
export * from "./types/ViewModelTypes";

// Events
export * from "./events/ApplicationEvents";
export * from "./events/EventBus";

// Repositories
export * from "./repositories/IRepository";

// Adapters
export * from "./adapters";

// Services
export * from "./services";

// Facade
export * from "./facade/ApplicationFacade";

// Stores
export * from "./stores";

// ViewModels
export * from "./viewmodels";

// DI
export * from "./di/Container";
export * from "./di/tokens";
