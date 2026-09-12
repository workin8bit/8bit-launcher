# Dokumen 10 — Feature Contracts Specification

| Field | Value |
|-------|-------|
| **Kode** | D10 |
| **Judul** | Feature Contracts Specification |
| **Versi** | 1.0 — READY FOR LOCK |
| **Tanggal** | 12 September 2026 |
| **Parent** | D09A Architecture Lint & Dependency Enforcement (D00 → D09) |
| **Depends On** | D00 Constitution, D01 Product Vision, D02 Architecture, D04 Agent Core, D05 Memory, D06 Android, D07 Execution, D07A Scheduler, D07B SyncQueue, D08 Control Surface, D08A State & Interaction, D09 Frontend Application Contract, D09A Lint Enforcement |
| **Scope** | 6 Features: Dashboard, Tasks, Execution, Memory, Sync, Android — contract-level (what each feature promises) |
| **Sifat** | **Feature Contract — tunduk penuh D00–D09A, tidak menciptakan authority baru** |
| **Status** | READY FOR LOCK — scaffolding 24 files PASS (76 files linted) |

> **Prinsip:** `D09 defines how features may connect. D10 defines what each feature promises.` — D10 tidak mengubah `D09A` canonical direction, tidak bypass `ApplicationFacade`, tidak memasukkan implementation detail ke `ViewModel`.

---

## 1. Tujuan

D09A telah mengunci boundary (`npm run check` PASS). Sebelum `Real Adapter Integration`, setiap feature harus memiliki **kontrak eksplisit** yang dapat divalidasi `D09A`:

- `Input → Output → ViewState → Events → Commands → ViewModel → Store → UI` konsisten untuk keenam feature.
- `ApplicationFacade` dependency explicit, `Service/Adapter` hanya via `D09`, tidak ada `UI → Service` langsung.
- `Error`, `Loading`, `Empty`, `Lifecycle`, `Transition Rules`, `Ownership` terdokumentasi — agar `D10A` (Interaction/State) dan `Real Adapter` tidak menebak.

D10 adalah **contract, bukan implementasi**. Tidak ada `Fake*Adapter` diganti, tidak ada `ExecutionEngine` diinstansiasi di feature.

## 2. Kedudukan dalam Hierarki

```
D00 Constitution
 └─ D09 Frontend Application Contract (how features may connect)
     └─ D09A Architecture Lint & Enforcement (gate)
         └─ Feature Modules Scaffolding (6 × ui/viewmodels/stores — PASS)
             └─ D10 Feature Contracts ← THIS DOCUMENT (what each feature promises)
                 └─ D10A Feature Interaction / State Contracts
                     └─ Real Adapter Integration (D05/D06/D07/D07A/D07B via DI)
```

- **Subordinate:** D10 tunduk pada D00–D09A. Jika D10 bertentangan, D00–D09A menang dan D10 direvisi.
- **No New Authority:** D10 tidak menciptakan `TaskEngine`, `SyncAuthority`, atau `AndroidManager`. Authority tetap `D07`, `D07B`, `D06`, `D05`.
- **No Direction Change:** Canonical `UI → ViewModel → Facade → Service → Adapter → Authority` tidak boleh diubah untuk mengakomodasi feature.

## 3. Prinsip Umum D10

1. **Facade-only:** Feature `ViewModel` hanya boleh memanggil `ApplicationFacade`. Tidak ada `import { ExecutionService }` di feature.
2. **Projection, not Source:** `Store` adalah projection dari authority, bukan source of truth. `execution` state milik `D07`, `sync` milik `D07B`.
3. **Pure UI:** `ui/*` hanya props + pure `mapTo*()` helpers. Tidak ada `fetch`, `new Database()`, atau `Android Intent`.
4. **No Impl Detail:** `ViewModel` tidak boleh tahu `ToolId`, `StepExecutor`, `SyncTransport`, `InsForge` — semua di `Adapter`.
5. **Typed:** Tidak ada `any`. Semua `Input/Output/ViewState` explicit, `Error` via `ApplicationError` + `messageKey`.
6. **Ownership Jelas:** `DashboardStore`, `TasksStore`, dst. masing-masing owned oleh feature-nya. Tidak ada `globalStore`.
7. **Lifecycle Explicit:** `startObserving → load/refresh → subscribe → dispose` untuk setiap ViewModel.
8. **Empty/Loading First-Class:** Setiap feature mendefinisikan `emptyState` dan `loading` — bukan afterthought.
9. **Testability:** ViewModel dapat di-test dengan `FakeApplicationFacade` tanpa authority. Store dapat di-test sebagai reducer murni.
10. **Lintable:** Semua file feature harus `arch-lint PASS` — `D09A` adalah gate untuk D10.

## 4. Konvensi File & Public Boundary

```
src/features/<feature>/
├── index.ts                 ← public feature boundary (hanya ViewModel/Store/UI contract)
├── types/
│   ├── input.ts
│   ├── output.ts
│   ├── view-state.ts
│   ├── events.ts
│   ├── commands.ts
│   └── errors.ts           (opsional — atau reuse ApplicationError)
├── viewmodels/
│   └── <Feature>ViewModel.ts
├── stores/
│   └── <Feature>Store.ts
└── ui/
    └── <Feature>Screen.ts
```

*Catatan:* Struktur final tidak dipaksakan — feature boleh menyesuaikan jika kontrak menghendaki — tetapi **setiap feature harus memiliki `index.ts` boundary eksplisit** dan setiap file harus memenuhi `§5` dependency rules dan `D09A`.

**Allowed imports per feature file (ringkas, detail di §5 per feature):**
- `ui/*` → `viewmodels/*`, `stores/*` (type-only ViewState), `facade`, `shared` — **FORBIDDEN** `services/adapters/repositories/infrastructure/authority`
- `viewmodels/*` → `facade`, `stores/*`, `shared` — **FORBIDDEN** `adapters/repositories`
- `stores/*` → `shared` only

## 5. Model Umum — Error, Loading, Empty, Lifecycle

### 5.1 Error Model (untuk semua feature)

```ts
// Reuse ApplicationError (D09 §77) — tidak ada FeatureError baru yang bypass
type FeatureError = {
  code: string;           // mis. "VALIDATION_ERROR", "NOT_FOUND", "OFFLINE"
  messageKey: string;     // i18n — "tasks.goalRequired", "sync.offline"
  retryable: boolean;     // dari authority, ViewModel tidak memutuskan
  correlationId?: string;
};
```

ViewModel tidak boleh membuat `retryable: true` sendiri — meneruskan dari `Facade` result.

### 5.2 Loading States

- `Store.isLoading: boolean` — dikontrol `ViewModel` saat `facade.*` in-flight.
- `ViewModel` menggunakan `AbortController` untuk cancel load sebelumnya (race prevention, D08A).
- UI: `isLoading → skeleton/disabled`, tidak mengontrol retry.

### 5.3 Empty States

Setiap `Store` mendefinisikan `empty` explicit:
- `dashboard`: `recentActivity: [] && execution.active===0 && sync.pending===0` → `DashboardEmpty { titleKey: "dashboard.empty" }`
- `tasks`: `tasks: []` → `TasksEmpty { actionKey: "tasks.createFirst" }`
- `execution`: `executionId not found` → `ExecutionEmpty { code: "NOT_FOUND" }`
- `memory`: `items: [] && query === ""` → `MemoryEmpty { variant: "initial" }`, `query !== "" && items: []` → `variant: "no-results"`
- `sync`: `pending===0 && syncing===0` → `SyncEmpty { status: "SYNCED" }`
- `android`: `apps: []` → `AndroidEmpty { reason: "no-apps" }`

### 5.4 Lifecycle Umum

```
init(userContext) → startObserving() → load() → subscribe(listener) → onAction() → refresh() → stopObserving() → dispose()
```

- `dispose()` harus `abort` + `unsubscribe` (D09 §153-154).
- `startObserving` hanya untuk sync/execution (authority push); dashboard/memory/tasks/android menggunakan `load()` pull.

---

## 6. Feature: Dashboard — Shell/Orchestration Surface

### 6.1 Purpose & Responsibility
Agregasi **read-only** status lintas authority untuk shell. Tidak memiliki state domain sendiri — hanya projection dari `execution + sync + scheduler + recentActivity`. Tidak membuat task, tidak retry sync sendiri.

### 6.2 Public Boundary
`src/features/dashboard/index.ts` → `DashboardStore`, `DashboardViewModel`, `DashboardScreen` (`mapToScreenState`). Tidak export `Service/Adapter`.

### 6.3 Input
```ts
type DashboardInput = { userContext: UserContext }; // dari bootstrap/session
```

### 6.4 Output
```ts
type DashboardOutput = DashboardViewState; // dari facade.getDashboard()
// DashboardViewState defined in D09 ProjectionTypes — reused, not redefined
```

### 6.5 ViewState
```ts
// Reuse D09 — tidak re-definisi
interface DashboardViewState {
  execution: { active: number; failed: number };
  sync: SyncViewState; // status, pendingCount, failedCount, conflictCount, canRetry
  scheduler: SchedulerViewState; // queued, running, etc.
  recentActivity: Array<{ id: string; type: string; title: string; timestamp: string }>;
  isLoading: boolean;
}
```

### 6.6 Events
- `DashboardViewModel.loadRequested` → `Facade.getDashboard`
- `SyncStatusChanged (from D07B adapter event)` → `DashboardStore sync updated` (via Facade observe — dashboard tidak subscribe langsung D07B)

### 6.7 Commands
Tidak ada command write — dashboard adalah **query surface** (`GetDashboard`). Tidak ada `CreateTask` di dashboard.

### 6.8 ViewModel
`DashboardViewModel(facade: ApplicationFacade, store: DashboardStore, userContext: UserContext)`
- `load(): Promise<void>` — `store.set({isLoading:true}) → facade.getDashboard() → store.set(data)`
- `subscribe(listener): () => void` — proxy `store.subscribe`
- `dispose()` — abort
- **Tidak** melakukan `retry`, `cancel`, `create`.

### 6.9 Store
`DashboardStore` — projection only. `set(next: DashboardViewState)`, `get(): DashboardViewState`, `subscribe()`. Tidak memiliki `Repository`.

### 6.10 UI
`DashboardScreen` — `props: { viewModel: DashboardViewModel }`, helper `mapToScreenState(viewState) → { isLoading }`. Render adalah `recentActivity` list + sync indicator `●/◐/○/!` (via `SyncViewState.status`).

### 6.11 Facade Dependency
`ApplicationFacade.getDashboard(userContext)` — **satu-satunya** dependency. Tidak boleh `getSyncStatus` terpisah di ViewModel.

### 6.12 Service Dependencies
`DashboardService` tidak ada — aggregasi dilakukan di `Facade.getDashboard` yang delegasi ke `ExecutionService + SyncService + SchedulerService` lalu project. Dashboard feature **tidak tahu** service mana.

### 6.13 Adapter Dependencies
Tidak ada adapter di feature. Adapter tetap `D07/D07A/D07B` via services.

### 6.14 Error Model
`Facade.getDashboard` → `ApplicationError { code, messageKey, retryable }` → `Store.error: null` (dashboard menelan error sebagai `isLoading:false` dan UI menampilkan `messageKey: "dashboard.loadFailed"`). Dashboard tidak retry otomatis.

### 6.15 Loading States
`Store.isLoading` true selama `facade.getDashboard` in-flight. UI disable refresh.

### 6.16 Empty States
`recentActivity.length===0 && execution.active===0` → UI `DashboardEmpty`. Tidak ada action selain `Go to Tasks`.

### 6.17 Lifecycle
`load()` on mount → `subscribe` → `dispose` on unmount. Tidak ada `startObserving`.

### 6.18 State Transition Rules
`isLoading: false → true` hanya saat `load()` dipanggil. `false → false` jika `abort` sebelum response.

### 6.19 Data Ownership
Authority `D07/D07B/D07A` owns data. DashboardStore owns **projection cache**, bukan domain.

### 6.20 Dependency Rules
`ui → viewmodels + shared`, `viewmodels → facade + stores + shared`, `stores → shared`. **FORBIDDEN** `ui → services`, `viewmodels → adapters`.

### 6.21 Forbidden Responsibilities
Dilarang: `createTask`, `retrySync`, `resolveConflict`, `schedule`, `persist`.

### 6.22 Integration Points
`ApplicationFacade.getDashboard` → `DashboardViewModel.load` → `DashboardStore` → `DashboardScreen`.

### 6.23 Testability
`DashboardViewModel` test dengan `FakeApplicationFacade.getDashboard` yang return `DashboardViewState` stub. Tidak butuh `D07`.

### 6.24 Acceptance — Dashboard

| ID | Criteria | Must |
|----|----------|------|
| D10-DASH-001 | `load()` aggregates `execution/sync/scheduler/recentActivity` via `Facade` only | PASS arch-lint |
| D10-DASH-002 | Empty state rendered when `recentActivity===[] && active===0` | UI test |
| D10-DASH-003 | `dispose()` aborts in-flight `getDashboard` | ViewModel test |
| D10-DASH-004 | No `any`, no direct adapter access | lint PASS |

---

## 7. Feature: Tasks — Task Lifecycle

### 7.1 Purpose & Responsibility
Membuat dan membatalkan task (goal → execution). Tasks adalah **write surface** untuk `D07` — task = `Execution` yang belum di-schedule/run. Projection `tasks: ExecutionViewState[]` dari `D07`.

### 7.2 Public Boundary
`TasksStore`, `TasksViewModel`, `TasksScreen` (`deriveFormState`).

### 7.3 Input
```ts
type CreateTaskInput = { goal: string; userContext: UserContext };
type CancelTaskInput = { executionId: string; userContext: UserContext };
```

### 7.4 Output
```ts
type CreateTaskOutput = { executionId: string } | ApplicationError;
type CancelTaskOutput = void | ApplicationError;
```

### 7.5 ViewState
```ts
interface TasksViewState {
  tasks: ExecutionViewState[]; // projection D07
  isLoading: boolean;
  error: { messageKey: string } | null;
}
```

### 7.6 Events
- `CreateTaskRequested { goal }` → ViewModel
- `CancelTaskRequested { executionId }` → ViewModel
- `ExecutionUpdated { executionId, state }` (via Facade event) → store updated (future D10A)

### 7.7 Commands
- `ExecuteTask { goal }` — canonical `D03 Tool` `executeTask`
- `CancelTask { executionId }`

Kedua command diteruskan **tanpa modifikasi** ke `Facade` — `ViewModel` tidak menambahkan `priority` atau `plan` (itu `D04`).

### 7.8 ViewModel
`TasksViewModel(facade, store, userContext)`
- `onCreateTask(goal: string): Promise<{success, executionId?, errorKey?}>` — validate `goal.trim()` → `store.setLoading(true)` → `facade.executeTask(goal, ctx)` → `store.setLoading(false)` → return `errorKey` adalah `messageKey`.
- `onCancelTask(executionId)` → `facade.cancelTask`
- `subscribe()`, `dispose()` — abort.

**Tidak** melakukan `retry` atau `offline queue` — itu `D07B`.

### 7.9 Store
`TasksStore` — `set()`, `get()`, `setLoading()`, `subscribe()`. Tidak memiliki `Repository`. `tasks` di-derive dari `ExecutionStore` di masa depan `D10A` (saat ini scaffolding menyimpan `[]` dan `ViewModel` belum push ke store — contract ini menetapkan behavior).

### 7.10 UI
`TasksScreen` — `deriveFormState(goal, isSubmitting) → { canSubmit: goal.trim().length>0 && !isSubmitting }`. Form tidak tahu `ExecutionState`. UI hanya disable `canSubmit`.

### 7.11 Facade Dependency
`ApplicationFacade.executeTask(goal, ctx)`, `cancelTask(executionId, ctx)`. Tidak ada `getTasks` — tasks list di-derive dari `getExecution` list di `D10A`.

### 7.12 Service Dependencies
`ExecutionService (D07)` via `Facade`. Feature tidak tahu `SchedulerService`.

### 7.13 Adapter Dependencies
Tidak ada. `ExecutionAdapter` tetap di `D09`.

### 7.14 Error Model
`VALIDATION_ERROR` (`goalRequired`) diputuskan `ViewModel` (app-level validation). `ApplicationError` dari `Facade` (`OFFLINE`, `PERMISSION_DENIED`) diteruskan sebagai `errorKey`.

### 7.15 Loading States
`isLoading` true selama `executeTask` flight. `canSubmit` false selama loading.

### 7.16 Empty States
`tasks.length===0` → `TasksEmpty { actionKey: "tasks.createFirst", messageKey: "tasks.empty" }`.

### 7.17 Lifecycle
`onCreateTask` → `subscribe` untuk list → `dispose`. Tidak ada `startObserving`.

### 7.18 State Transition Rules
`[] → [task]` hanya via `onCreateTask success` yang menghasilkan `executionId`. `tasks` tidak bisa dimutasi langsung `store.set(tasks: [...])` dari UI.

### 7.19 Data Ownership
`D07 Execution` owns `tasks`. `TasksStore` owns **presentation filter** (mis. `filter: "active"` di D10A, bukan D10).

### 7.20 Dependency Rules
`ui → viewmodels + stores(type) + shared`, `viewmodels → facade + stores + shared`. FORBIDDEN `ui → services`, `viewmodels → SyncQueue`.

### 7.21 Forbidden Responsibilities
Dilarang: `retry` (D07 RecoveryManager), `schedule` (D07A), `persist` (D07B), `Tool validation` (D03), `plan steps` (D04).

### 7.22 Integration Points
`TasksScreen form submit → TasksViewModel.onCreateTask → Facade.executeTask → D07.ExecutionEngine` → (future) `ExecutionUpdated event → TasksStore`.

### 7.23 Testability
`TasksViewModel` test dengan `FakeFacade.executeTask` return `{executionId}` atau `{error}` — tidak butuh `D07`.

### 7.24 Acceptance — Tasks

| ID | Criteria |
|----|----------|
| D10-TASK-001 | `onCreateTask("")` → `errorKey: "tasks.goalRequired"` tanpa memanggil Facade |
| D10-TASK-002 | `onCreateTask("goal")` → `isLoading` true selama flight, false setelah |
| D10-TASK-003 | `onCancelTask` hanya jika task ada |
| D10-TASK-004 | No `any`, no `new ExecutionService` |

---

## 8. Feature: Execution — Execution-Facing Projection

### 8.1 Purpose & Responsibility
Menampilkan dan mengontrol satu `Execution` (D07 state machine `CREATED → VALIDATING → READY → RUNNING → ... → COMPLETED/FAILED`). Tidak menjalankan execution — hanya **projection + control** (`pause/cancel/retry`).

### 8.2 Public Boundary
`ExecutionStore` (Map<id, ExecutionViewState>), `ExecutionViewModel`, `ExecutionScreen` (`mapExecutionToScreenState`).

### 8.3 Input
```ts
type ExecutionInput = { executionId: string; userContext: UserContext };
```

### 8.4 Output
```ts
type ExecutionOutput = ExecutionViewState | ApplicationError;
```

### 8.5 ViewState
```ts
// Reuse D09 ExecutionViewState
interface ExecutionViewState {
  executionId: string;
  title: string;
  status: "QUEUED"|"SCHEDULED"|"RUNNING"|"PAUSED"|"COMPLETED"|"FAILED"|"CANCELLED"|"DENIED";
  progress: number;
  canPause: boolean; canResume: boolean; canCancel: boolean; canRetry: boolean;
  isLoading: boolean; isSubmitting: boolean;
  error: { messageKey: string; category: string } | null;
}
```
`canPause` dkk. di-derive dari `D07 ExecutionState` + `PolicyEvaluator` via projection — ViewModel tidak menghitung.

### 8.6 Events
- `PauseRequested { executionId }`
- `CancelRequested { executionId }`
- `RetryRequested { executionId }`
- `ExecutionRefreshed { executionId }` → `Facade.getExecution`

### 8.7 Commands
- `PauseTask { executionId }` → `Facade.pauseTask`
- `CancelTask { executionId }` → `Facade.cancelTask`
- `RetryTask { executionId }` → `Facade.executeTask(title)` (re-create)
- `GetExecution { executionId }` → `Facade.getExecution`

### 8.8 ViewModel
`ExecutionViewModel(facade, store, userContext)`
- `getViewState(id)` → `store.get(id)`
- `onPause(id)` — guard `canPause` → `facade.pauseTask`
- `onCancel(id)` — guard `canCancel`
- `onRetry(id)` — guard `canRetry`
- `refresh(id)` — `facade.getExecution` (rehydration, D09 §55)
- `observe(id, cb)` — proxy `store.subscribe`
- `dispose()`.

**Tidak** mengubah `progress` sendiri.

### 8.9 Store
`ExecutionStore` — `Map<string, ExecutionViewState>` dengan `set/clear/subscribe`. Disuplai oleh `Facade` observe di `bootstrap` (future real adapter). Saat ini scaffolding menyimpan manual.

### 8.10 UI
`ExecutionScreen` — `mapExecutionToScreenState(execution, isLoading)`. UI hanya render `status` + `progress` + `can*` buttons disabled.

### 8.11 Facade Dependency
`pauseTask`, `cancelTask`, `executeTask` (for retry), `getExecution`. Tidak ada `SchedulerService` langsung.

### 8.12 Service Dependencies
`ExecutionService (D07)` via Facade.

### 8.13 Adapter Dependencies
Tidak ada. `ExecutionAdapter` tetap `D09`.

### 8.14 Error Model
`NOT_FOUND` (`execution.notFound`) → `ExecutionEmpty`. `PERMISSION_DENIED` → `error.messageKey: "execution.permissionDenied"`.

### 8.15 Loading States
`store.get(id).isLoading` true selama `refresh`. `can*` false selama loading.

### 8.16 Empty States
`executionId not found` → `ExecutionEmpty { messageKey: "execution.notFound", action: "back" }`.

### 8.17 Lifecycle
`observe(id)` on mount → `refresh(id)` → `onPause/onCancel` → `dispose` → `unsubscribe`. Process death: `refresh(id)` rehydrates dari `D07`.

### 8.18 State Transition Rules
`RUNNING → PAUSED` hanya via `onPause` success. `PAUSED → RUNNING` via `retry` (future). UI tidak boleh `RUNNING → COMPLETED` sendiri — authority decides.

### 8.19 Data Ownership
`D07` owns `Execution`. Feature owns **control intent** (`pause requested`) bukan **state**.

### 8.20 Dependency Rules
`viewmodels → facade + stores + shared`, `ui → viewmodels + shared` (ViewState type dari `ProjectionTypes`, bukan `ExecutionEngine`). FORBIDDEN `viewmodels → adapters`, `stores → authority`.

### 8.21 Forbidden Responsibilities
Dilarang: `run StepExecutor`, `evaluate Policy`, `verify output`, `retry with backoff` (itu `D07`).

### 8.22 Integration Points
`ExecutionScreen button → ViewModel.onPause → Facade.pauseTask → D07 ExecutionStateMachine`.

### 8.23 Testability
`FakeFacade.pauseTask` stub → ViewModel guard `canPause` ter-test tanpa `D07`.

### 8.24 Acceptance — Execution

| ID | Criteria |
|----|----------|
| D10-EXEC-001 | `onPause` guard `canPause` false → tidak memanggil Facade |
| D10-EXEC-002 | `refresh` rehydrates not-found → empty state |
| D10-EXEC-003 | `observe` unsubscribes on `dispose` |
| D10-EXEC-004 | No `ExecutionEngine` import in feature |

---

## 9. Feature: Memory — Memory-Facing Projection

### 9.1 Purpose & Responsibility
Mencari dan membuat memori (D05). Tidak melakukan embedding, policy, atau context building — itu `D05`.

### 9.2 Public Boundary
`MemoryStore`, `MemoryViewModel`, `MemoryScreen` (`deriveSearchFormState`).

### 9.3 Input
```ts
type SearchMemoryInput = { query: string; userContext: UserContext };
type CreateMemoryInput = { content: string; type: string; userContext: UserContext };
```

### 9.4 Output
```ts
type SearchMemoryOutput = MemoryViewState[] | ApplicationError;
type CreateMemoryOutput = { id: string } | ApplicationError;
```

### 9.5 ViewState
```ts
interface MemoryListViewState {
  items: MemoryViewState[]; // { id, type, content, createdAt, canDelete }
  isLoading: boolean;
  query: string;
  error: { messageKey: string } | null;
}
```

### 9.6 Events
- `SearchRequested { query }`
- `CreateRequested { content, type }`

### 9.7 Commands
- `SearchMemory { query }` → `Facade.searchMemory`
- `CreateMemory { content, type }` → `Facade.createMemory`

### 9.8 ViewModel
`MemoryViewModel(facade, store, userContext)`
- `onSearch(query)` — `store.set({query, isLoading:true}) → facade.searchMemory(query) → store.setLoading(false)` atau `error`.
- `onCreate(content, type)` — validate `content.trim()` → `facade.createMemory` → return `id` atau `errorKey`.
- `subscribe()`, `dispose()`.

### 9.9 Store
`MemoryStore` — `set()`, `get()`, `setLoading()`, `subscribe()`. Tidak memiliki `EmbeddingAdapter`.

### 9.10 UI
`MemoryScreen` — `deriveSearchFormState(query, isSearching) → { canSearch: query.trim().length>0 }`. UI tidak tahu `embedding dimension`.

### 9.11 Facade Dependency
`searchMemory(query, ctx)`, `createMemory(content, type, ctx)`.

### 9.12 Service Dependencies
`MemoryService (D05)` via Facade.

### 9.13 Adapter Dependencies
Tidak ada. `MemoryAdapter` tetap `D09`.

### 9.14 Error Model
`VALIDATION_ERROR` (`memory.contentRequired`) dari ViewModel. `NOT_FOUND` → empty variant `"no-results"`.

### 9.15 Loading States
`isLoading` true selama `search`. UI `canSearch` false selama loading.

### 9.16 Empty States
`query==="" && items===[]` → `variant: "initial"`, `query!=="" && items===[]` → `variant: "no-results"`.

### 9.17 Lifecycle
`onSearch` → `subscribe` → `dispose`.

### 9.18 State Transition Rules
`items` hanya berubah via `onSearch success` — tidak via direct `store.set(items: [...])` dari UI.

### 9.19 Data Ownership
`D05` owns `Memory`. Feature owns **search projection**.

### 9.20 Dependency Rules
`ui → viewmodels + shared`, `viewmodels → facade + stores + shared`. FORBIDDEN `viewmodels → MemoryAdapter`, `ui → D05`.

### 9.21 Forbidden Responsibilities
Dilarang: `embed`, `rank`, `forget policy`, `context window building`.

### 9.22 Integration Points
`MemoryScreen search → ViewModel.onSearch → Facade.searchMemory → D05.search`.

### 9.23 Testability
`FakeFacade.searchMemory` return `[]` → ViewModel empty variant test tanpa `D05`.

### 9.24 Acceptance — Memory

| ID | Criteria |
|----|----------|
| D10-MEM-001 | `onSearch("")` masih call Facade dengan `""` (ViewModel tidak filter) |
| D10-MEM-002 | `onCreate("")` → `errorKey: "memory.contentRequired"` tanpa Facade |
| D10-MEM-003 | Empty `initial` vs `no-results` dibedakan |

---

## 10. Feature: Sync — Sync State/Projection

### 10.1 Purpose & Responsibility
Menampilkan status sinkronisasi (D07B) dan memicu `retry`/`refresh` — tidak melakukan `queue`, `transport`, `conflict resolve` sendiri.

### 10.2 Public Boundary
`SyncStore`, `SyncViewModel`, `SyncScreen` (`indicatorForStatus`).

### 10.3 Input
```ts
type SyncInput = { userContext: UserContext };
```

### 10.4 Output
```ts
type SyncOutput = SyncViewState | ApplicationError;
```

### 10.5 ViewState
```ts
interface SyncViewState {
  status: "SYNCED"|"SYNCING"|"OFFLINE"|"ATTENTION";
  pendingCount: number; syncingCount: number; failedCount: number; conflictCount: number;
  lastSyncAt?: string; lastErrorCategory?: string | null;
  canRetry: boolean;
}
```

### 10.6 Events
- `SyncStatusChanged` (authority event via `Facade.observeSync`)
- `RetryRequested`
- `RefreshRequested`

### 10.7 Commands
- `GetSyncStatus` → `Facade.getSyncStatus`
- `ObserveSync` → `Facade.observeSync`
- `RetrySync` → `Facade.requestSync` (future — saat ini placeholder via `getSyncStatus` refresh)

### 10.8 ViewModel
`SyncViewModel(facade, store, userContext)`
- `startObserving()` — `facade.observeSync(ctx, status → store.set(map))` — guard `unsubscribe` sebelumnya.
- `stopObserving()`, `refresh()` — `facade.getSyncStatus → store.set`
- `onRetry()` — guard `canRetry` → (future `requestSync`)
- `subscribe()`, `dispose()` → `stopObserving`.

### 10.9 Store
`SyncStore` — `get()`, `set()`, `subscribe()`. Tidak memiliki `SyncQueue`.

### 10.10 UI
`SyncScreen` — `indicatorForStatus(status) → "●"|"◐"|"○"|"!"`. UI tidak memutuskan `canRetry` — dari `ViewState`.

### 10.11 Facade Dependency
`getSyncStatus(ctx)`, `observeSync(ctx, cb)`. `requestSync` akan ditambah di D10A tanpa mengubah ViewModel contract (open for extension).

### 10.12 Service Dependencies
`SyncService (D07B)` via Facade.

### 10.13 Adapter Dependencies
Tidak ada. `SyncAdapter` tetap `D09`.

### 10.14 Error Model
`OFFLINE` → `status: "OFFLINE"`, `CONFLICT` → `status: "ATTENTION"`, `conflictCount>0`. `retryable` dari authority.

### 10.15 Loading States
`SYNCING` → `indicator "◐"`. `store` tidak memiliki `isLoading` terpisah — `status` adalah loading.

### 10.16 Empty States
`pending===0 && syncing===0 && status==="SYNCED"` → UI `SyncEmpty { messageKey: "sync.upToDate" }`.

### 10.17 Lifecycle
`startObserving()` on mount → `refresh()` → `onRetry()` → `stopObserving()` on unmount → `dispose`.

### 10.18 State Transition Rules
`SYNCED → SYNCING` hanya via authority event, tidak via `ViewModel.set`. `ATTENTION` hanya jika `conflictCount>0`.

### 10.19 Data Ownership
`D07B SyncQueue` owns `queue`. Feature owns **projection**.

### 10.20 Dependency Rules
`viewmodels → facade + stores + shared`, `ui → viewmodels + shared` (indicator helper). FORBIDDEN `viewmodels → SyncQueue`, `stores → D07B`.

### 10.21 Forbidden Responsibilities
Dilarang: `enqueue`, `transport`, `backoff`, `conflict resolve` (itu `D07B`).

### 10.22 Integration Points
`SyncViewModel.startObserving → Facade.observeSync → D07B.SyncAdapter.observeSync`.

### 10.23 Testability
`FakeFacade.observeSync` push `SyncStatus` stub → `SyncStore` ter-update tanpa `D07B`.

### 10.24 Acceptance — Sync

| ID | Criteria |
|----|----------|
| D10-SYNC-001 | `startObserving` twice → only one subscription (guard) |
| D10-SYNC-002 | `dispose` → `stopObserving` called |
| D10-SYNC-003 | `indicatorForStatus("ATTENTION") === "!"` |
| D10-SYNC-004 | No `SyncQueue` import in feature |

---

## 11. Feature: Android — Android App Projection/Launcher

### 11.1 Purpose & Responsibility
Menampilkan daftar app terinstal dan meluncurkan app via `D06` — tidak memanggil `Android Intent` langsung.

### 11.2 Public Boundary
`AndroidStore`, `AndroidViewModel`, `AndroidScreen` (`mapToRows`).

### 11.3 Input
```ts
type AndroidInput = { userContext: UserContext };
type OpenAndroidInput = { packageName: string; userContext: UserContext };
```

### 11.4 Output
```ts
type AndroidListOutput = AndroidAppInfo[] | ApplicationError; // AndroidAppInfo { packageName, label, launchable }
type OpenAndroidOutput = void | ApplicationError;
```

### 11.5 ViewState
```ts
interface AndroidViewState {
  apps: AndroidAppInfo[];
  isLoading: boolean;
  error: { messageKey: string } | null;
}
```

### 11.6 Events
- `LoadAppsRequested`
- `OpenAppRequested { packageName }`

### 11.7 Commands
- `GetInstalledApps` → `Facade.getInstalledApps`
- `OpenAndroidApp { packageName }` → `Facade.openAndroidApp`

### 11.8 ViewModel
`AndroidViewModel(facade, store, userContext)`
- `loadApps()` — `store.setLoading(true) → facade.getInstalledApps → store.set({apps, isLoading:false})` atau `error`.
- `onOpenApp(packageName)` — validate `trim()` → `facade.openAndroidApp` → return `errorKey` jika gagal.
- `subscribe()`, `dispose()`.

**Canonical chain:** `UI button → ViewModel.onOpenApp → Facade.openAndroidApp → AndroidService → D06 → Android` — tidak ada `Button → Intent`.

### 11.9 Store
`AndroidStore` — `get()`, `set()`, `setLoading()`, `subscribe()`. Tidak memiliki `AndroidAdapter`.

### 11.10 UI
`AndroidScreen` — `mapToRows(viewState) → AndroidAppRowProps[]`. UI tidak tahu `packageName` valid atau tidak — `launchable` dari projection.

### 11.11 Facade Dependency
`getInstalledApps(ctx)`, `openAndroidApp(packageName, ctx)`.

### 11.12 Service Dependencies
`AndroidService (D06)` via Facade.

### 11.13 Adapter Dependencies
Tidak ada. `AndroidAdapter` tetap `D09`.

### 11.14 Error Model
`permissionRequired` (`android.permissionDenied`), `notFound` (`android.appNotFound`), `unknown`. `retryable=false` untuk semua (launch tidak retry).

### 11.15 Loading States
`isLoading` true selama `loadApps`. `onOpenApp` tidak memiliki loading terpisah — action adalah fire-and-forget.

### 11.16 Empty States
`apps.length===0` → `AndroidEmpty { reason: "no-apps", actionKey: "android.refresh" }`. `error !== null` → `AndroidErrorView`.

### 11.17 Lifecycle
`loadApps()` on mount → `subscribe` → `onOpenApp` → `dispose`.

### 11.18 State Transition Rules
`apps` hanya via `loadApps success` — tidak via direct `store.set`.

### 11.19 Data Ownership
`D06` owns `installed apps`. Feature owns **projection**.

### 11.20 Dependency Rules
`viewmodels → facade + stores + shared`, `ui → viewmodels + shared`. FORBIDDEN `viewmodels → AndroidAdapter`, `ui → D06`.

### 11.21 Forbidden Responsibilities
Dilarang: `query PackageManager` langsung, `startActivity` langsung, `permission request` langsung — semua via `D06`.

### 11.22 Integration Points
`AndroidScreen row click → ViewModel.onOpenApp → Facade.openAndroidApp → D06.AndroidAdapter.openApp`.

### 11.23 Testability
`FakeFacade.getInstalledApps` return `[{packageName: "com.example", label:"Example"}]` → ViewModel test tanpa `D06`.

### 11.24 Acceptance — Android

| ID | Criteria |
|----|----------|
| D10-ANDR-001 | `loadApps` sets `isLoading` true then false |
| D10-ANDR-002 | `onOpenApp("")` → `errorKey: "android.packageRequired"` tanpa Facade |
| D10-ANDR-003 | No `AndroidAdapter` import in feature |

---

## 12. Cross-Feature Rules (D10 Global)

### 12.1 No New Authority
Tidak ada feature boleh mendefinisikan `ExecutionEngine`, `SyncQueue`, `Scheduler`, `MemoryEngine`. Jika butuh logic domain baru, buat di `D07` family dan expose via `Adapter` — feature tetap `ViewModel → Facade`.

### 12.2 No Cross-Feature Store Access
`features/dashboard` **dilarang** `import { TasksStore }`. Feature hanya boleh `→ Facade → Service`. Jika dashboard butuh `tasks count`, itu `Facade.getDashboard` yang aggregate, bukan `dashboard ViewModel` membaca `TasksStore`.

### 12.3 No Global State
Tidak ada `globalStore`. Setiap feature memiliki `Store` terpisah. `ExecutionStore` tidak bisa diimport oleh `Tasks` feature — share via `Facade` event atau `D10A` interaction contract.

### 12.4 No Any, No New
Setiap file feature harus `arch-lint PASS` + `no-any PASS` + `tsc PASS`. `new *Service/*Adapter` tetap FORBIDDEN.

### 12.5 Facade Stability
`ApplicationFacade` adalah satu-satunya entry. Menambah method `getDashboard` tidak memerlukan perubahan `ViewModel` lain. `Facade` tidak boleh menjadi God Object — orchestration, bukan business logic.

## 13. Data Ownership Summary

| Data | Owner (Authority) | Projection Owner (Feature) |
|------|-------------------|----------------------------|
| Execution state, progress, can* | `D07` | `ExecutionStore` (feature/execution) — read-only |
| Tasks list (executions) | `D07` | `TasksStore` — read-only |
| Sync status, pending, conflicts | `D07B` | `SyncStore` |
| Installed apps | `D06` | `AndroidStore` |
| Memory items | `D05` | `MemoryStore` |
| Dashboard aggregate | `D09 Facade` (compose `D07/D07B/D07A`) | `DashboardStore` |

## 14. Dependency Rules Summary (Feature Level)

```
features/*/ui ──→ features/*/viewmodels, features/*/stores (type-only), core/application/facade, shared
features/*/viewmodels ──→ core/application/facade, features/*/stores, shared
features/*/stores ──→ shared
```

**FORBIDDEN untuk semua feature:** `→ services`, `→ adapters`, `→ repositories`, `→ infrastructure`, `→ core/execution|sync|memory|android` langsung.

## 15. Testability Requirements (D10)

| Layer | How to Test | Without |
|-------|-------------|---------|
| `ViewModel` | Inject `FakeApplicationFacade` (stub `executeTask`, `getDashboard`, etc.) — assert `store` state, `errorKey`, `isLoading` | Tidak butuh `D07/D06/D05` |
| `Store` | Pure: `store.set() → subscribe` assert snapshot — tidak ada side effect | Tidak butuh `Facade` |
| `UI` | Render `ViewModel` stub + `mapTo*()` helpers — assert `canSubmit`, `indicator` | Tidak butuh `ViewModel` real |
| `Integration` | `ViewModel + FakeFacade + Store` → `UI` prop | Tidak butuh `Adapter` |

## 16. Acceptance — D10 Global

| ID | Criteria | Must |
|----|----------|------|
| **D10-001** | 6 features memiliki `index.ts` public boundary — hanya ViewModel/Store/UI | LINT + scaffolding |
| **D10-002** | Setiap feature mendefinisikan `Input/Output/ViewState/Events/Commands` explicit | Dokumen §6-11 |
| **D10-003** | `ViewState` projection, bukan domain entity — `Store` is not source of truth | D09 §15 |
| **D10-004** | `Error` via `ApplicationError.messageKey`, `retryable` dari authority — ViewModel tidak invent | Test |
| **D10-005** | `Loading` via `Store.isLoading` + `AbortController` race prevention | ViewModel test |
| **D10-006** | `Empty` variant terdokumentasi untuk setiap feature (§5.3) | UI test |
| **D10-007** | `Lifecycle` `init → load/observe → subscribe → action → dispose` terdokumentasi | §5.4 + per feature §17 |
| **D10-008** | `Data ownership` jelas — feature projection, authority source | §13 |
| **D10-009** | Dependency rules per feature dienforce `D09A` — `npm run check` PASS | LINT |
| **D10-010** | No new authority — tidak ada `class ExecutionEngine` di features | `authority-ownership` |
| **D10-011** | No bypass Facade — feature tidak import `services/adapters` | `public-boundary` |
| **D10-012** | No `any` | `no-any` |
| **D10-013** | No implementation detail di ViewModel (`ToolId`, `SyncTransport`, `Intent`) | Review |
| **D10-014** | `D09A` tetap gate — D10 tidak mengubah matrix | D09A unchanged |
| **D10-015** | `D10` cukup kuat sebagai dasar `D10A` (Interaction/State Contracts) | Next spec |
| **D10-016** | Scaffolding 24 files tetap PASS setelah D10 | 76 files PASS |

---

**Status Dokumen:** READY FOR LOCK — menunggu persetujuan. Setelah LOCK, `D10` menjadi **authoritative feature contract** untuk keenam feature. `D10A` akan memperdalam interaksi lintas feature (`dashboard ↔ tasks ↔ execution ↔ sync`), dan `Real Adapter Integration` baru mengganti `Fake*Adapter` via DI — tanpa mengubah `ViewModel/Store/UI`.

**Invariant:** `D09 defines how features may connect. D10 defines what each feature promises. D09A ensures neither drifts.`

