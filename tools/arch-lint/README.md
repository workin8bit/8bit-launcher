# Architecture Lint — D09 Dependency Enforcement

> **Purpose:** Lock `UI → ViewModel → Facade → Service → Adapter → Authority` before feature modules grow.
> **Principle:** *Frontend coordinates. Authorities decide.* (D09 §240)
> **Status:** ✅ PASS — 52 files, 0 violations

## Canonical Chain

```
UI (features/*/ui) 
  ↓ Event → Command
ViewModel (application/viewmodels, features/*/viewmodels)
  ↓ Command / Query
Facade (application/facade) — stable boundary, orchestration only
  ↓ delegates
Service (application/services) — delegation + translation, no authority
  ↓ via Adapter
Adapter (application/adapters) — type/event/error translation, no semantics change
  ↓ calls
Authority (execution, scheduler, sync, memory, android) — D03–D07B — owns its state
```

Shared: `types`, `events`, `di` — importable everywhere (`order: -1`)

## Rules (6)

| # | Rule | What it catches | Doc |
|---|------|-----------------|-----|
| 1 | `dependency-direction` | Layer matrix violation (e.g., Facade → Adapter) | D09 §66-68 |
| 2 | `forbidden-import` | Explicit forbidden substrings (UI→infra, VM→repo, VM→SyncQueue, etc.) | D09 §13, §34, §105 |
| 3 | `public-boundary` | Feature/UI importing internal `services/adapters/stores` instead of `ApplicationFacade` barrel | D09 §71-72 |
| 4 | `di-only` | `new Database()`, `new SyncQueue()`, `new *Service()` outside `di/` / `bootstrap` | D09 §27 |
| 5 | `no-circular` | Cross-layer circular imports (internal authority cycles ignored) | D09 §27 |
| 6 | `authority-ownership` | Re-implementing `ExecutionEngine`, `SyncQueue`, `Scheduler` outside authority | D00–D07B |
| + | `no-any` | `any` is forbidden — use `unknown` + narrowing | D09 §77, §146 |

## Config

`tools/arch-lint/config.mjs` is single source of truth:

- `LAYERS` — path → layer (ui, viewmodel, store, facade, service, adapter, repository, infrastructure, authority, shared)
- `ALLOWED_IMPORTS` — matrix
- `FORBIDDEN_IMPORT_PATTERNS` — regex per `from` layer
- `PUBLIC_BOUNDARY` — allowed entry points
- `DI_ONLY` — allowed `new` locations
- `AUTHORITY_OWNERSHIP` — forbidden re-implementations

## Usage

```bash
npm run lint:arch          # PASS/FAIL with summary
npm run lint:arch:verbose  # + file list
npm run lint:no-any        # any check
npm run lint:types         # tsc for application layer (D09)
npm run check              # all three — CI gate
```

Exit code `0` = PASS, `1` = FAIL.

### CI

`.github/workflows/arch-lint.yml` runs `check` on every push/PR to `main`/`develop`. Failing PR is blocked.

## Forbidden Examples (caught)

```typescript
// ❌ in src/features/tasks/viewmodels/TaskViewModel.ts
import { IRepository } from "src/core/application/repositories/IRepository"; // forbidden-import
import { SyncQueue } from "src/core/sync/SyncQueue";                         // ViewModel → SyncQueue

// ❌ in src/features/tasks/ui/TaskScreen.ts
import { FakeDatabase } from "src/infrastructure/Database";                  // UI → infrastructure

// ❌ in src/core/application/services/ExecutionService.ts
import { ExecutionEngine } from "src/core/execution/ExecutionEngine";        // Service → Engine internals

// ❌ in src/core/application/adapters/SyncAdapter.ts
import { ExecutionViewStore } from "../stores/ExecutionViewStore";           // Adapter → Presentation

// ❌ in src/features/tasks/viewmodels/TaskViewModel.ts
const queue = new SyncQueue(); // di-only
const db = new Database();     // di-only

// ❌ any
function handle(data: any) {} // no-any
```

**Correct:**

```typescript
// ✅ ViewModel → Facade → Service → Adapter → Authority
import { ApplicationFacade } from "src/core/application/facade/ApplicationFacade";
import type { ExecutionViewState } from "src/core/application/types/ProjectionTypes";

export class TaskViewModel {
  constructor(private facade: ApplicationFacade, private userContext: UserContext) {}
  async onCreate(goal: string) {
    await this.facade.executeTask(goal, this.userContext); // canonical
  }
}
```

## Verifying

```bash
# should PASS
npm run check

# create violation — should FAIL
echo 'import { IRepository } from "../repositories/IRepository";' >> src/core/application/viewmodels/BadViewModel.ts
npm run lint:arch  # ❌ forbidden-import

# remove & PASS again
rm src/core/application/viewmodels/BadViewModel.ts
npm run lint:arch  # ✅
```

## Adding a New Feature

Create under `src/features/<name>/`:

```
features/<name>/
├── ui/           → layer: ui — may import viewmodels, facade, shared
├── viewmodels/   → layer: viewmodel — may import facade, stores, shared
├── stores/       → layer: store — shared only
└── services/     → layer: service — adapter, repository, shared (if feature owns service)
```

Feature must **not** import `src/core/application/services/*` directly — always via `ApplicationFacade`.

## Type Safety

`tsconfig.application.json` includes only `src/core/application` — ensures D09 scaffolding is strictly typed (`noImplicitAny: true`). Execution scaffolding legacy errors are isolated.

## References

- Dokumen-09 Frontend Application Contract §4, §5-8, §27, §66-68, §71-72, §105, §146-147, §240-241
- D00 Master Constitution Ch. 4 — Dependency Rule
- D07/D07A/D07B — authority boundaries
