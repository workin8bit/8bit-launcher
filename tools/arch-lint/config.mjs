/**
 * D09 Architecture Lint — Config
 * Single source of truth for dependency direction enforcement
 * Authority ownership per D00–D08A
 */

export const LAYERS = {
  ui:           { pattern: /(^|\/)src\/(features\/[^/]+\/ui|features\/[^/]+\/presentation|ui|presentation|app)(\/|$)/, order: 0, label: "UI" },
  viewmodel:    { pattern: /(^|\/)src\/(core\/application\/viewmodels|features\/[^/]+\/viewmodels)(\/|$)/, order: 1, label: "ViewModel" },
  store:        { pattern: /(^|\/)src\/(core\/application\/stores|features\/[^/]+\/stores)(\/|$)/, order: 2, label: "Store" },
  facade:       { pattern: /(^|\/)src\/core\/application\/facade(\/|$)/, order: 3, label: "Facade" },
  service:      { pattern: /(^|\/)src\/(core\/application\/services|features\/[^/]+\/services)(\/|$)/, order: 4, label: "Service" },
  adapter:      { pattern: /(^|\/)src\/(core\/application\/adapters|infrastructure\/adapters)(\/|$)/, order: 5, label: "Adapter" },
  repository:   { pattern: /(^|\/)src\/(core\/application\/repositories|infrastructure\/repositories)(\/|$)/, order: 6, label: "Repository" },
  infrastructure:{ pattern: /(^|\/)src\/infrastructure(\/|$)/, order: 7, label: "Infrastructure" },
  authority:    { pattern: /(^|\/)src\/core\/(execution|scheduler|sync|memory|android|tool)(\/|$)/, order: 8, label: "Authority (D03–D07B)" },
  shared:       { pattern: /(^|\/)src\/core\/application\/(types|events|di|interaction)(\/|$)/, order: -1, label: "Shared (types/events/di/interaction)" },
};

// Dependency direction: lower order → higher order is FORBIDDEN to go upward beyond 1-hop violations
// Canonical chain: ui → viewmodel → facade → service → adapter → authority
// Shared (types/events/di) is importable by anyone — order -1 means neutral

export const ALLOWED_IMPORTS = {
  ui:           ["viewmodel", "store", "facade", "shared"], // ui may import ViewState types from stores (type-only) — runtime store access still via ViewModel
  viewmodel:    ["facade", "store", "shared"],
  store:        ["shared"],
  facade:       ["service", "shared"],
  service:      ["adapter", "repository", "shared"],
  adapter:      ["authority", "repository", "infrastructure", "shared"],
  repository:   ["shared", "infrastructure"],
  infrastructure: ["shared"],
  authority:    ["shared"], // authorities must not depend on application layers
  shared:       ["shared"],
};

// Explicitly forbidden path substrings — catches any import containing these, regardless of layer matrix
export const FORBIDDEN_IMPORT_PATTERNS = [
  // UI → infrastructure / repositories / authorities
  { from: "ui",          forbidden: /src\/infrastructure|\/repositories|src\/core\/(execution|scheduler|sync|memory|android)/, msg: "UI → infrastructure/repositories/authority is FORBIDDEN (must go via ViewModel → Facade)" },
  { from: "ui",          forbidden: /src\/core\/application\/adapters/, msg: "UI → Adapter is FORBIDDEN (must go via ViewModel → Facade → Service)" },
  { from: "ui",          forbidden: /src\/core\/application\/services/, msg: "UI → Service is FORBIDDEN (must go via Facade)" },

  // ViewModel → repositories / infrastructure / syncqueue / android authority / adapters
  { from: "viewmodel",   forbidden: /\/repositories|src\/infrastructure/, msg: "ViewModel → repositories/infrastructure is FORBIDDEN (D09 §34, §13)" },
  { from: "viewmodel",   forbidden: /SyncQueue|SyncAdapter.*direct|src\/core\/sync/, msg: "ViewModel → SyncQueue (D07B) is FORBIDDEN — must go via Facade → SyncService" },
  { from: "viewmodel",   forbidden: /AndroidAdapter|src\/core\/android/, msg: "ViewModel → Android authority (D06) is FORBIDDEN — must go via Facade → AndroidService" },
  { from: "viewmodel",   forbidden: /src\/core\/application\/adapters/, msg: "ViewModel → Adapter is FORBIDDEN" },

  // Store → anything except shared
  { from: "store",       forbidden: /src\/core\/application\/(adapters|services|facade|repositories)|src\/core\/(execution|sync|memory|android)|src\/infrastructure/, msg: "Store → Service/Adapter/Authority/Infrastructure is FORBIDDEN — Store is not source of truth (D09 §15)" },

  // Service → internals
  { from: "service",     forbidden: /src\/core\/execution\/(ExecutionEngine|StepExecutor|ExecutionStateMachine|PermissionGate)/, msg: "Service → Engine internals is FORBIDDEN — must go via Adapter" },
  { from: "service",     forbidden: /src\/core\/sync\/.*SyncQueue|src\/core\/memory\/.*Repository/, msg: "Service → SyncQueue/Memory internals is FORBIDDEN — must go via Adapter" },
  { from: "service",     forbidden: /src\/(features|core\/application\/viewmodels|core\/application\/stores|presentation|ui)/, msg: "Service → Presentation (ViewModel/Store/UI) is FORBIDDEN — one-way only" },

  // Adapter → Presentation
  { from: "adapter",     forbidden: /src\/core\/application\/(viewmodels|stores|facade)|src\/features\/.*\/(viewmodels|stores|ui)/, msg: "Adapter → Presentation is FORBIDDEN (D09 §21-26)" },

  // Repository interface should not import infrastructure implementation
  { from: "repository",  forbidden: /src\/infrastructure/, msg: "Repository interface → infrastructure implementation is FORBIDDEN — interface is boundary" },

  // di is allowed to import everything for wiring — no forbidden patterns
];

// Public boundary: only these files may be imported from outside src/core/application
export const PUBLIC_BOUNDARY = {
  allowedEntryPoints: [
    "src/core/application/index.ts",
    "src/core/application/facade/ApplicationFacade.ts",
    "src/core/application/bootstrap.ts",
    "src/core/application/di/Container.ts",
    "src/core/application/di/tokens.ts",
  ],
  // Internals that should never be imported directly by features/ui
  internalPatterns: [
    /src\/core\/application\/services\//,
    /src\/core\/application\/adapters\//,
    /src\/core\/application\/stores\//,
  ],
};

// DI-only construction: `new XService`, `new XAdapter`, `new Database`, `new SyncQueue` outside allowed locations
export const DI_ONLY = {
  allowedNewLocations: [
    /src\/core\/application\/di\//,
    /src\/core\/application\/bootstrap\.ts$/,
    /tools\//,
    /__tests__\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
  ],
  forbiddenNewPatterns: [
    { pattern: /new\s+(ExecutionService|SchedulerService|SyncService|MemoryService|AndroidService)\s*\(/, msg: "Direct `new *Service()` outside DI is FORBIDDEN — use Container.resolve()" },
    { pattern: /new\s+(ExecutionAdapter|SchedulerAdapter|SyncAdapter|MemoryAdapter|AndroidAdapter)\s*\(/, msg: "Direct `new *Adapter()` outside DI/bootstrap is FORBIDDEN" },
    { pattern: /new\s+Database\s*\(/, msg: "`new Database()` in ViewModel/Store/UI is FORBIDDEN (D09 §27)" },
    { pattern: /new\s+SyncQueue\s*\(/, msg: "`new SyncQueue()` outside D07B is FORBIDDEN" },
    { pattern: /new\s+ExecutionEngine\s*\(/, msg: "`new ExecutionEngine()` outside D07 is FORBIDDEN" },
  ],
};

// Authority ownership (D00–D08A) — files that belong to specific authority must not be re-implemented in application
export const AUTHORITY_OWNERSHIP = {
  // If any file outside authority tries to implement these classes, flag
  forbiddenReimplementations: [
    { pattern: /class\s+ExecutionEngine\b/, allowedPath: /src\/core\/execution\//, msg: "Reimplementing ExecutionEngine outside src/core/execution is FORBIDDEN (D07 owns execution)" },
    { pattern: /class\s+SyncQueue\b/,       allowedPath: /src\/core\/sync\//, msg: "Reimplementing SyncQueue outside src/core/sync is FORBIDDEN (D07B owns sync)" },
    { pattern: /class\s+Scheduler\b/,       allowedPath: /src\/core\/scheduler\//, msg: "Reimplementing Scheduler outside src/core/scheduler is FORBIDDEN (D07A owns scheduling)" },
  ],
};

export const SCAN_GLOBS = ["src/**/*.ts"];
export const IGNORE_PATTERNS = [/node_modules/, /dist/, /\.next/, /__pycache__/, /\.arena/, /\.git/];
