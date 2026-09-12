# D09 Frontend Application Contract — Scaffolding

> **Status:** SCAFFOLDING — Contract first, implementation-neutral
> **Authority:** D00 → D08A → D09 — May orchestrate, may not replace authorities
> **Principle:** `UI → ViewModel → Facade → Service → Adapter → Authority` — one-way data flow

## Structure

```
src/core/application/
├── types/
│   ├── ApplicationTypes.ts    # Command/Query/Result/ApplicationError — typed, no `any`
│   ├── ProjectionTypes.ts     # ExecutionViewState, SyncViewState, DashboardViewState — no raw leakage
│   └── ViewModelTypes.ts      # ViewModel contracts, FormState
├── events/
│   ├── ApplicationEvents.ts   # Typed events: EXECUTION_UPDATED, SYNC_STATUS_CHANGED, etc.
│   └── EventBus.ts            # InMemoryEventBus — typed, scoped, lifecycle-aware
├── repositories/
│   └── IRepository.ts         # IRepository/IRepository — boundary, no DB details
├── adapters/
│   ├── ExecutionAdapter.ts    # D07 — FakeExecutionAdapter for scaffolding
│   ├── SchedulerAdapter.ts    # D07A
│   ├── SyncAdapter.ts         # D07B — getSyncStatus/observeSync
│   ├── MemoryAdapter.ts       # D05
│   └── AndroidAdapter.ts      # D06
├── services/
│   ├── ExecutionService.ts    # Delegates to D07, validates app-level only
│   ├── SchedulerService.ts    # → D07A
│   ├── SyncService.ts         # → D07B
│   ├── MemoryService.ts       # → D05
│   └── AndroidService.ts      # → D06
├── facade/
│   └── ApplicationFacade.ts   # Stable boundary — executeTask, cancelTask, getDashboard, searchMemory, openAndroidApp
├── stores/
│   ├── ExecutionViewStore.ts  # Presentation state only — not source of truth
│   └── SyncViewStore.ts
├── viewmodels/
│   ├── ExecutionViewModel.ts  # Domain→Presentation + Event→Command — no repository
│   └── DashboardViewModel.ts  # Composition, not authority
├── di/
│   ├── tokens.ts              # Explicit tokens — no hard-coded singleton in feature
│   └── Container.ts           # DI container — explicit, testable, lifecycle-aware
├── bootstrap.ts               # D09 §89 — Load Config → DI → Session → Repos → Adapters → Stores → Routing → Hydrate → READY
└── index.ts                   # Barrel — public API
```

## Contract Guarantees (D09 §241)

- **One-way data flow:** `Authority → Adapter → Service → Projection → Store → ViewModel → UI`
- **No new authority:** Services delegate, not decide — Store is not source of truth
- **No direct access:** `UI → Database / SyncQueue / Android SDK` is **FORBIDDEN** (checked via architecture lint)
- **Facade is stable:** UI depends on `ApplicationFacade`, not on `D07 internal API`
- **DI only:** No `new Database()` in ViewModel/Store — all via `Container`
- **Secrets never in presentation:** tokens/passwords not in store, URL, logs
- **Offline valid:** `LOCAL_SUCCESS → PENDING_SYNC → SYNCING → SYNCED` (D07B)

## Usage

```typescript
import { bootstrapApplication } from "./bootstrap";
import { ExecutionViewModel } from "./viewmodels/ExecutionViewModel";

const { container, facade } = bootstrapApplication();
const userContext = { userId: "user_123" };

// Command via Facade — stable boundary
const result = await facade.executeTask("Cari materi Android CLI", userContext);
if (result.success) {
  console.log("executionId:", result.data.executionId);
}

// ViewModel — presentation only
const vm = new ExecutionViewModel(facade, container.resolve(TOKENS.ExecutionViewStore), userContext);
await vm.onCancel("exec_123");

// Dashboard composition
const dashboardVm = new DashboardViewModel(facade, userContext);
await dashboardVm.load();
console.log(dashboardVm.viewState);
```

## Testing

```typescript
// Unit: ViewModel → Command
// Contract: Adapter satisfies authority contract
// Integration: Facade → Service → Adapter → Authority (fake)
// E2E: User Action → Application → Authority → UI State
```

## Next Steps

- Replace `Fake*Adapter` with real `*Adapter` that calls D07/D05/D06 via DI
- Wire `ExecutionViewStore` to `ExecutionAdapter.observeExecution` for live updates
- Add feature modules: `features/tasks, features/memory, features/sync` — each with `application/presentation/viewmodels/stores`
- Add architecture linting: `UI → infrastructure import` → build failure

## Invariants

- `Frontend coordinates. Authorities decide.` (D09 §240)
- Hierarchy compliance: D09 subordinate to D00–D08A — no conflicting authority (FE-040)
