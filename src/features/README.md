# Features — Boundary Scaffolding (D09 Enforcement)

> **Status:** SCAFFOLDING — Boundary + Contract only, no business logic
> **Gate:** `npm run check` → `arch-lint PASS` (76 files) + `no-any PASS` + `lint:types PASS`
> **Rule:** Feature tidak boleh menciptakan authority baru — `ui → viewmodels → ApplicationFacade`

## Struktur (24 file, 6 features)

```
src/features/
├── dashboard/   — shell/orchestration surface (aggregates execution/sync/scheduler)
│   ├── stores/DashboardStore.ts       — DashboardViewState projection
│   ├── viewmodels/DashboardViewModel.ts — load() via facade.getDashboard()
│   ├── ui/DashboardScreen.ts          — props, mapToScreenState(), renderer contract
│   └── index.ts                       — public barrel
├── tasks/       — task lifecycle
│   ├── stores/TasksStore.ts           — TasksViewState { tasks: ExecutionViewState[] }
│   ├── viewmodels/TasksViewModel.ts   — onCreateTask() → facade.executeTask()
│   ├── ui/TasksScreen.ts              — form derive helper
│   └── index.ts
├── execution/   — execution-facing projection (D07)
│   ├── stores/ExecutionStore.ts       — Map<executionId, ExecutionViewState>
│   ├── viewmodels/ExecutionViewModel.ts — onPause/onCancel/onRetry → facade
│   ├── ui/ExecutionScreen.ts
│   └── index.ts
├── memory/      — memory-facing projection (D05)
│   ├── stores/MemoryStore.ts          — MemoryListViewState
│   ├── viewmodels/MemoryViewModel.ts  — onSearch() / onCreate() → facade
│   ├── ui/MemoryScreen.ts
│   └── index.ts
├── sync/        — sync state/projection (D07B)
│   ├── stores/SyncStore.ts            — SyncViewState
│   ├── viewmodels/SyncViewModel.ts    — startObserving() via facade.observeSync()
│   ├── ui/SyncScreen.ts               — indicatorForStatus() ●/◐/○/!
│   └── index.ts
└── android/     — Android app projection/launcher (D06)
    ├── stores/AndroidStore.ts         — AndroidViewState { apps: AndroidAppInfo[] }
    ├── viewmodels/AndroidViewModel.ts — loadApps() / onOpenApp() → facade
    ├── ui/AndroidScreen.ts            — mapToRows()
    └── index.ts
```

## Prinsip (dienforce lint)

| Prinsip | Enforce | Contoh benar | Contoh salah (FAIL) |
|---------|---------|--------------|---------------------|
| `ui → viewmodels → ApplicationFacade` | `forbidden-import` + `dependency-direction` | `viewmodels` import `facade/ApplicationFacade` | `viewmodels` import `ExecutionEngine` |
| Tidak akses `repository/service/adapter` langsung | `public-boundary` | `viewmodels` hanya `facade` | `features/tasks/ui` import `services/ExecutionService` |
| Tidak import authority `SyncQueue`, `Scheduler` | `forbidden-import` + `authority-ownership` | `viewmodels` → `facade` → `SyncService` → `D07B` | `new SyncQueue()` di ViewModel |
| `stores` hanya presentation state | `store → shared` only | `stores/*` import `types/ProjectionTypes` | `store` import `adapters/*` |
| Tidak ada `any` | `no-any` | `unknown` + narrowing | `data: any` |
| Tidak ada `new Service()` | `di-only` | `Container.resolve()` di `bootstrap` | `new ExecutionService()` di ViewModel |
| Public barrel | `public-boundary` | `features/*/index.ts` export ViewModel/Store/UI | Feature export Service/Adapter |

## Verifikasi

```bash
npm run check
# ✅ arch-lint: PASS — 76 files, 0 violations
# ✅ no-any: PASS — 74 files, 0 violations
# ✅ lint:types: PASS

# Violation terdeteksi:
# - ViewModel → ExecutionEngine → FAIL
# - UI → IRepository → FAIL
```

## Next: Real Adapter Integration

Scaffolding ini sengaja **tanpa business logic** — agar D09 tetap enforcement layer. Tahap berikutnya (sesuai urutan Anda):

1. `D07` real `ExecutionAdapter` (ganti `FakeExecutionAdapter`)
2. `D07A` `SchedulerAdapter`
3. `D07B` `SyncAdapter` + InsForge transport
4. `D05` `MemoryAdapter` + embeddings
5. `D06` `AndroidAdapter`

Semua adapter tetap **via DI**, feature tidak berubah — `viewmodels` tetap `→ facade` tanpa modifikasi.

## Usage (preview)

```ts
import { bootstrapApplication } from "@/core/application/bootstrap";
import { DashboardViewModel } from "@/features/dashboard";
import { DashboardStore } from "@/features/dashboard/stores/DashboardStore";

const { facade } = bootstrapApplication();
const store = new DashboardStore();
const vm = new DashboardViewModel(facade, store, { userId: "user_123" });
await vm.load();
```

## Invariant

`Feature coordinates. Authority decides. D09 enforces.` — feature modules tidak akan pernah diam-diam menjadi authority.
