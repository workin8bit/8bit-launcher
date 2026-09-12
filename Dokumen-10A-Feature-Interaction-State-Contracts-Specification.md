# Dokumen 10A — Feature Interaction / State Contracts Specification

| Field | Value |
|-------|-------|
| **Kode** | D10A |
| **Judul** | Feature Interaction / State Contracts Specification |
| **Versi** | 1.0 — **LOCKED** |
| **Tanggal** | 12 September 2026 — **LOCKED 12 September 2026 19:05 WIB** |
| **Parent** | D10 Feature Contracts Specification (D00 → D10) |
| **Depends On** | D00 Constitution, D08A State & Interaction, D09 Frontend Application Contract, D09A Architecture Lint & Enforcement, D10 Feature Contracts (Dashboard, Tasks, Execution, Memory, Sync, Android) |
| **Scope** | Cross-feature interaction model, event/command propagation, state synchronization, lifecycle, invariants — 6 features |
| **Sifat** | **Interaction/State Contract — tunduk penuh D00–D10, tidak menciptakan authority baru — AUTHORITATIVE** |
| **Status** | **LOCKED** — gate PASS (83 files, 0 violations, 0 whitelist) — D09/D10 unchanged |

> **Prinsip:** `Feature Store = local projection/state. Facade = cross-feature coordination boundary. Event Contract = notification. Command Contract = requested action. Authority = actual source of truth.` — Feature **tidak membaca Store feature lain**. Feature berinteraksi **melalui contract**.

---

## 1. Tujuan

D10 telah menetapkan `WHAT each feature promises` (Input/Output/ViewState per feature). Yang belum terjawab: **bagaimana feature bereaksi terhadap perubahan feature lain tanpa melanggar ownership dan boundary D09A/D10**.

Jika tidak dikunci, `Dashboard ↔ Tasks ↔ Execution ↔ Sync` akan mudah menjadi `DashboardStore → TasksStore → ExecutionStore` — rantai store yang melanggar `D10 §12.2` dan membuat `Real Adapter Integration` sulit dibedakan apakah failure ada di boundary, DI, adapter, atau authority.

D10A mengunci:

- Model interaksi lintas feature yang sah (hanya via `Facade` + `Event/Command` contracts).
- Propagasi event (producer/consumer, ordering, deduplication, stale, subscription).
- Sinkronisasi state (source of truth → projection → derived → reconciliation → rehydration).
- Interaksi command (who produces, who executes, correlation, cancellation).
- Lifecycle contract (`mount → dispose`) per feature dan lintas feature.
- Invariants dan larangan (no direct Store access, no event mutation, no cycles).
- Test scenarios per interaction path.

D10A **tidak mengubah** `D09`/`D09A`/`D10` dan tidak mendefinisikan implementasi adapter nyata.

## 2. Kedudukan dalam Hierarki

```
D09  → HOW application coordinates (Facade → Service → Adapter)
D09A → ENFORCE dependency direction (gate)
D10  → WHAT each feature promises (6 features × ViewState/Commands)
D10A → HOW features interact safely (this document — interaction/state contracts)
D11  → Real Adapter Integration / next layer (D05/D06/D07/D07A/D07B via DI)
```

- **Subordinate:** D10A tunduk pada D00–D10. Jika D10A bertentangan, D00–D10 menang.
- **No Authority:** D10A tidak memiliki `ExecutionEngine`, `SyncQueue`, atau `MemoryEngine`. Ia hanya mendefinisikan **contract interaction di atas D09 + D10**.
- **Enforced By:** `D09A` — `arch-lint` tetap gate. `D10A` tidak menambah layer baru yang mem-bypass `Facade`.

## 3. Prinsip Utama D10A

| Konsep | Makna | Kepemilikan |
|--------|-------|-------------|
| `Feature Store` | Local projection/state — `DashboardStore`, `TasksStore`, dst. | Feature itu sendiri — **tidak boleh dibaca feature lain** |
| `Facade` | Cross-feature coordination boundary — satu-satunya jembatan lintas feature | `D09` — `ApplicationFacade` |
| `Event Contract` | Notification — `ExecutionCompleted`, `SyncStatusChanged` — tidak meminta aksi | Authority → Adapter → Facade → EventBus → Store |
| `Command Contract` | Requested action — `CreateTask { goal }` — meminta authority melakukan aksi | `ViewModel → Facade → Service → Adapter → Authority` |
| `Authority` | Actual source of truth — `D07` untuk execution, `D07B` untuk sync | `D07/D07B/D06/D05` |

**Invariant:** `Feature tidak membaca Store feature lain. Feature berinteraksi melalui contract.`

## 4. Cross-Feature Interaction Model

### 4.1 Interaction Graph — Yang Diizinkan

```
                    ┌─────────────┐
                    │   Tasks     │  CreateTask → Facade.executeTask
                    └──────┬──────┘
                           │ ExecutionCreated (event)
                           ▼
                    ┌─────────────┐
                    │  Execution  │  Execution lifecycle (D07 state machine)
                    └──────┬──────┘
                           │ ExecutionStateChanged / ProgressUpdated
                           ├───────────────┬───────────────┐
                           ▼               ▼               ▼
                    ┌─────────────┐  ┌───────────┐  ┌───────────┐
                    │    Sync     │  │ Dashboard │  │   Tasks   │ (list update)
                    │ (D07B queue)│  │ (aggregate)│  └───────────┘
                    └──────┬──────┘  └─────┬─────┘
                           │ SyncStatusChanged
                           └───────► Dashboard (pendingCount)
                                    (indicator ●/◐/○/!)

Memory ── isolated ──► tidak ada cross-feature event kecuali Dashboard recentActivity (future)
Android ─ isolated ──► tidak ada cross-feature event — hanya via Facade.openAndroidApp
```

**Penjelasan:**

- **Tasks → Execution:** Satu-satunya interaksi `Tasks` yang sah adalah `TasksViewModel.onCreateTask → Facade.executeTask` — yang menghasilkan `Execution` di `D07`. `Tasks` tidak pernah menulis `ExecutionStore` langsung.
- **Execution → Sync/Dashboard/Tasks:** `Execution` lifecycle event (`RUNNING → COMPLETED`) adalah **authority event** dari `D07` → `Adapter` → `Facade` → `EventBus` — yang kemudian tiga feature dapat **observe** sebagai projection, bukan direct store write.
- **Sync → Dashboard:** `SyncStatusChanged` adalah event `D07B` → `Dashboard` hanya membaca `pendingCount` via `Facade.getDashboard` (aggregate), bukan `SyncStore`.
- **Dashboard ↔ Tasks / Execution / Sync:** Dashboard **tidak subscribe** `TasksStore` atau `ExecutionStore`. Dashboard membaca `Facade.getDashboard` — Facade yang melakukan compose `D07 + D07B + D07A`.

### 4.2 Interaction Graph — Yang Dilarang (FAIL)

```
DashboardStore ──X──► TasksStore ──X──► ExecutionStore   // FORBIDDEN — direct Store chain
TasksViewModel ──X──► ExecutionStore                   // FORBIDDEN — ViewModel → Store feature lain
TasksViewModel ──X──► SyncQueue                        // FORBIDDEN — ViewModel → Authority
DashboardScreen ──X──► SyncService                     // FORBIDDEN — UI → Service
ExecutionStore ──X──► SyncStore (mutual)              // FORBIDDEN — cross-feature cycle
```

Setiap panah `X` di atas adalah **arch-lint FAIL** (`dependency-direction` + `forbidden-import`).

### 4.3 Kapan Interaction Diperlukan

| Dari → Ke | Trigger | Contract |
|-----------|---------|----------|
| `Tasks → Execution` | User create task | `Command: ExecuteTask { goal, correlationId }` |
| `Execution → Sync` | Execution needs persistence / tool side-effect | Authority: `D07` writes local + enqueues `D07B` — bukan feature interaction, melainkan `D07 → D07B` |
| `Execution → Tasks` | Execution state changed | `Event: ExecutionStateChanged { executionId, status, correlationId }` |
| `Execution → Dashboard` | Execution completed/failed | `Event: ExecutionCompleted` → `Facade.getDashboard` refresh |
| `Sync → Dashboard` | Queue status changed | `Event: SyncStatusChanged { pendingCount }` → `DashboardStore sync projection` |
| `Memory → Dashboard` | (future) recentActivity includes memory — belum D10, tidak ada event sekarang |
| `Android → *` | Tidak ada — isolated |

## 5. Event Propagation

### 5.1 Event Producer

Hanya **authority** yang boleh menjadi producer `domain event` (D07 Execution, D07B Sync, D06 Android, D05 Memory). Feature **tidak boleh** produce domain event sendiri — feature hanya produce `UI Intent → Command` yang kemudian authority produce event.

- `D07` produce: `ExecutionCreated`, `ExecutionStateChanged`, `ExecutionProgress`, `ExecutionCompleted`, `ExecutionFailed`
- `D07B` produce: `SyncStatusChanged`, `SyncConflictDetected`, `SyncCompleted`
- `D06` produce: `AndroidAppListChanged` (future)
- `D05` produce: `MemoryCreated` (feature-isolated, tidak broadcast cross-feature kecuali via Facade query)

Producer harus mengisi `eventId`, `correlationId`, `causationId`, `timestamp`, `aggregateId` (§11-13).

### 5.2 Event Consumer

Consumer adalah `Store` yang **subscribe** `Facade.observeX` atau `EventBus` typed.

- `ExecutionStore` consume `ExecutionStateChanged`
- `DashboardStore` consume `SyncStatusChanged` dan `ExecutionCompleted` (via `Facade.getDashboard` refresh, bukan direct event)
- `TasksStore` consume `ExecutionStateChanged` (untuk update list — future D10A, saat ini list di-derive via query)

Consumer **tidak boleh** mutate event payload — event adalah **immutable notification** (D08A). Mutation hanya pada `Store` projection miliknya.

### 5.3 Event Payload

```ts
type InteractionEvent<T> = {
  eventId: string;        // uuid — for deduplication
  eventType: string;      // "ExecutionStateChanged" — PastTense per D07
  aggregateId: string;    // executionId, syncId
  payload: T;             // typed, no `any`, no secrets
  correlationId: string;  // from originating Command
  causationId?: string;   // parent eventId if chained
  timestamp: string;      // ISO-8601 UTC, authority clock
  version: number;        // schema version
  userId: string;         // from UserContext — for filtering
};
```

Payload **tidak boleh** berisi `Store` internal shape — payload adalah `Authority Model` yang kemudian `Adapter → Projection` di feature.

### 5.4 Event Ordering

- **Per-aggregate ordering:** Events untuk `aggregateId` yang sama dikirim **ordered** (D07 state machine guarantees `RUNNING → COMPLETED` tidak terbalik).
- **Cross-aggregate ordering:** Tidak ada guarantee — `Execution A Completed` bisa tiba sebelum `Execution B Created` — consumer harus handle out-of-order via `timestamp` + `version`.
- **Facade boundary:** `Facade` tidak re-order events — meneruskan apa adanya dari `Adapter`.

### 5.5 Duplicate Event

- `EventBus` dan `Adapter` **at-least-once** (retry, reconnect, D07B Sync). Consumer **harus idempotent** — `eventId` dedup di `Store`/`ViewModel` (D08A, D09 §101).
- `ViewModel` tidak boleh membuat `executionId` baru untuk duplicate `ExecutionCompleted` — `Store.set(event.aggregateId)` adalah upsert idempotent.

### 5.6 Stale Event

Event dengan `timestamp < store.lastUpdateTimestamp` atau `version < store.lastVersion` dianggap **stale** dan **di-ignore** — Store tidak overwrite projection yang lebih baru dengan yang lama (D08A stale-view protection).

### 5.7 Subscription / Unsubscription

- **Producer does not know consumer:** `Authority` tidak tahu berapa `FeatureStore` yang subscribe — decoupling via `EventBus`.
- **Subscription ownership:** `ViewModel` owns `unsubscribe` — `startObserving()` creates, `stopObserving()`/`dispose()` destroys. `Store` tidak pernah subscribe sendiri — `Store` hanya `set()` dari `ViewModel`.
- **Lifecycle:** `subscribe` hanya antara `mount → dispose` — tidak ada global subscription yang leak (§22).

## 6. State Synchronization

### 6.1 Source of Truth

| Domain | Source of Truth | Projection Owner | Allowed Read Cross-Feature |
|--------|-----------------|------------------|----------------------------|
| Execution | `D07 ExecutionEngine + ExecutionRepository` | `ExecutionStore`, `TasksStore` (derived) | Hanya via `Facade.getExecution / getDashboard` — tidak via Store |
| SyncQueue | `D07B SyncQueue` | `SyncStore` | Hanya via `Facade.getSyncStatus / observeSync` |
| Memory | `D05` | `MemoryStore` | Hanya via `Facade.searchMemory` |
| Installed Apps | `D06` | `AndroidStore` | Hanya via `Facade.getInstalledApps` |
| Dashboard | `Facade` compose | `DashboardStore` | Read-only aggregate |

### 6.2 Projection

Setiap `Store` adalah **projection** satu arah: `AuthorityState → Adapter → Service → Facade → ViewModel → Store`. Projection adalah **lossy, typed, sanitized** — tidak ada raw authority model di `Store`.

- `ExecutionViewState` adalah projection `D07 Execution` — tidak ada `plan.steps` raw di `ExecutionStore`.
- `SyncViewState` adalah projection `D07B SyncStatus` — tidak ada `SyncQueue` internal di `SyncStore`.

### 6.3 Derived State

- `TasksStore.tasks` adalah **derived** dari `ExecutionStore` (atau `Facade` query) — bukan state independen. D10A belum merealisasi derived wiring — contract menetapkan bahwa `TasksViewModel` tidak boleh `store.set(tasks: [...])` manual, melainkan `refresh → Facade → D07 → event → store`.
- `DashboardStore.recentActivity` adalah derived dari `Facade.getDashboard` — bukan `TasksStore`.

### 6.4 Reconciliation

Ketika dua source memberi projection yang bertentangan (mis. `Execution Completed` event vs `Sync pending` masih `1`), `Facade.getDashboard` melakukan **reconciliation** — authority event timestamp menentukan mana yang lebih baru. Feature tidak boleh reconcile sendiri — ViewModel hanya `store.set(next)` apa adanya dari Facade.

### 6.5 Refresh

`ViewModel.refresh()` adalah **pull** — `facade.getX → store.set` — untuk reconciliation manual dan rehydration. Setiap `ViewModel` harus memiliki `refresh()` yang dapat dipanggil user (pull-to-refresh) atau `D10A` lifecycle (§8).

### 6.6 Rehydration setelah Process Death

`D08A / D09 §55` — `Store` adalah memory, `Authority` adalah durable. Setelah process death, `ViewModel` harus `refresh()` dari `Facade` (yang query `D07`/`D05`), bukan restore `Store` dari `localStorage`. `Store.reset()` + `Facade query` adalah contract.

### 6.7 Offline / Online Transition

- `SyncViewState.status` adalah **projection** `D07B` — `OFFLINE` adalah valid state (D08, D09 §159).
- Feature `Tasks/Execution` **tidak boleh** memutuskan `offline ? queue : execute` — keputusan tetap `D07B`. Feature hanya menampilkan `SyncViewState` via `Facade`.

## 7. Command Interaction

### 7.1 Siapa Boleh Menghasilkan Command

Hanya `ViewModel` yang boleh menghasilkan `Command` — dari `UI Event` (D09 §13). `Store` dan `UI` tidak boleh menghasilkan Command. `Adapter` dan `Service` tidak boleh menghasilkan Command — mereka **mengeksekusi**.

### 7.2 Siapa Mengeksekusi

`ApplicationFacade` menerima `Command` dan **delegate** ke `Service` yang tepat → `Adapter` → `Authority`. Facade tidak menjalankan logic — orchestration only (D09 §5).

- `TasksViewModel.onCreateTask` → `Facade.executeTask` → `ExecutionService → D07`
- `ExecutionViewModel.onPause` → `Facade.pauseTask` → `ExecutionService → D07`
- `SyncViewModel.onRetry` → `Facade.requestSync` → `SyncService → D07B`
- `AndroidViewModel.onOpenApp` → `Facade.openAndroidApp` → `AndroidService → D06`

### 7.3 Correlation ID

Setiap `Command` memiliki `commandId` (uuid) dan `correlationId` (yang sama untuk seluruh chain `Command → Event(s) → Store update`). `Event` yang dihasilkan authority harus membawa `correlationId` yang sama — sehingga `Dashboard` dapat menghubungkan `CreateTask` → `ExecutionCreated` → `SyncStatusChanged`.

```
UI click (goal="...") → ViewModel → Command { commandId: cmd_1, correlationId: corr_1 }
  → Facade → D07 → Event { eventId: evt_1, correlationId: corr_1, causationId: cmd_1 }
  → Store (idempotent dedup via eventId)
```

### 7.4 Success / Failure Propagation

- `Command` result adalah `Result<T, ApplicationError>` (D09 §77) — `Facade` meneruskan `success/error` ke `ViewModel`.
- `ViewModel` meneruskan `error.messageKey` ke `Store.error` dan UI menampilkan `messageKey` — tidak membuat `retryable` sendiri.
- `Event` failure adalah **notification** — `ExecutionFailed { executionId, error }` — consumer `Dashboard` menampilkan `failedCount` increment, bukan retry otomatis.

### 7.5 Cancellation

- `ViewModel.dispose()` → `AbortController.abort()` — membatalkan `facade.*` promise yang masih flight.
- `Facade` tidak melakukan `D07` cancellation untuk `Command` yang sudah dikirim — authority sudah memiliki `cancelTask` command terpisah.
- `Abort` tidak menghasilkan `Event` — hanya `ViewModel` → `Store.isLoading = false`.

## 8. Lifecycle Contract

Setiap Feature `ViewModel` harus mengikuti:

```
mount
  ↓  new ViewModel(facade, store, userContext)
initialize
  ↓  ViewModel.load() or startObserving()  (pull or subscribe)
subscribe
  ↓  ViewModel.subscribe(listener) → Store → UI re-render
active
  ↓  onAction() → Command → Facade → Authority → Event → Store
suspend / background  (Android lifecycle D06)
  ↓  ViewModel.stopObserving() — pause push, keep projection
resume
  ↓  ViewModel.startObserving() + refresh() — rehydrate stale (D08A)
dispose
  ↓  ViewModel.dispose() → abort + unsubscribe → Store remains but no listener
```

- **Mount:** Dependency via `Container`/`Bootstrap` — tidak ada `new ViewModel()` di UI dengan `new Service()`.
- **Initialize:** Hanya `ViewModel` yang memanggil `Facade` — `Store` tidak pernah `facade.*` langsung.
- **Suspend/Resume:** `SyncViewModel` dan `ExecutionViewModel` yang memiliki `observe` harus handle `D06 lifecycle` pause/resume — `DashboardViewModel` cukup `load()` ulang.
- **Dispose Guarantees:** `dispose()` harus idempotent dan harus `abort` + `unsubscribe` — tidak ada leak (tested via `D09A`? no-circular + lifecycle test).

## 9. Cross-Feature Invariants

### 9.1 Canonical Invariant: Create Task Flow

```
Create Task (D10)
  ↓  TasksViewModel.onCreateTask(goal)
Tasks
  ↓  Command ExecuteTask { goal, correlationId }
Facade → ExecutionService → D07 Authority (source of truth)
  ↓  Event ExecutionCreated { executionId, correlationId }
Execution (feature)
  ↓  ExecutionStore.set(executionId, ExecutionViewState { status: RUNNING })
  ↓  Event SyncStatusChanged { pendingCount: 1 }  (D07 enqueues D07B — bukan feature)
Sync
  ↓  SyncStore.set({ status: SYNCING })
  ↓  Event SyncStatusChanged (attention/resolved)
Dashboard
  ↓  Facade.getDashboard() refreshed (or observe)
  ↓  DashboardStore sync.pendingCount updated
```

**Forbidden alternative:**

```
DashboardStore ─X─► TasksStore ─X─► ExecutionStore   // FAIL — direct Store chain
TasksViewModel ─X─► ExecutionStore                   // FAIL — ViewModel → Store feature lain
```

### 9.2 Dashboard ↔ Execution / Sync

- Dashboard **tidak boleh** membaca `ExecutionStore` atau `SyncStore` langsung — harus `Facade.getDashboard`.
- Jika `ExecutionCompleted` event tiba, `DashboardViewModel` tidak boleh `ExecutionStore.get(id)` — harus `Facade.getDashboard` refresh.

### 9.3 Tasks ↔ Execution

- `Tasks` membuat `Execution`, tetapi `Tasks` tidak boleh update `ExecutionStore` — `ExecutionStore` hanya diupdate via `Execution` authority event.
- `Tasks` list adalah derived — `TasksViewModel` tidak boleh `store.set(tasks: [fakeTask])`.

### 9.4 Execution ↔ Sync

- `Execution` tidak tahu `SyncQueue` — `D07` yang enqueue ke `D07B`. Feature `ExecutionViewModel` tidak boleh `new SyncQueue`.
- `Sync` feature tidak tahu `Execution` progress — hanya `pendingCount`.

### 9.5 Memory ↔ Lainnya

- `Memory` isolated — tidak ada event lintas feature ke `Tasks/Execution`. Jika `Dashboard recentActivity` di masa depan menampilkan memory, itu via `Facade.getDashboard` compose, bukan `MemoryStore` → `DashboardStore`.

### 9.6 Android ↔ Lainnya

- `Android` isolated — `openAndroidApp` adalah command `D06` via `Facade` — tidak ada interaksi dengan `Execution` atau `Sync`. Hanya `Dashboard` yang mungkin menampilkan `last opened app` via `Facade` compose (future, tidak D10A).

## 10. Event Naming Convention

- **Past Tense:** `ExecutionCreated`, `ExecutionStateChanged`, `ExecutionCompleted`, `ExecutionFailed`, `SyncStatusChanged`, `SyncConflictDetected`, `MemoryCreated`, `AndroidAppListChanged` — konsisten dengan `D07` TransitionReason.
- **No Verbs:** Bukan `CreateExecution` (itu Command) — event adalah `ExecutionCreated` (sudah terjadi).
- **Namespaced:** `eventType: "EXECUTION_COMPLETED"` (SNAKE_UPPER) di `ApplicationEvent` (D09 §37) atau `PascalCase` di domain event — mapping via `Adapter`.

## 11. Command Naming Convention

- **Imperative:** `ExecuteTask`, `CancelTask`, `PauseTask`, `RetryTask`, `CreateMemory`, `SearchMemory`, `GetExecution`, `GetDashboard`, `GetSyncStatus`, `OpenAndroidApp`, `RequestSync`.
- **No Past Tense:** `ExecuteTask` bukan `ExecutionExecuted`.
- **Payload:** `type: string` di `ApplicationCommand` (D09 §11) — `type` adalah canonical command name.

## 12. Correlation ID

- **Generated at:** `ViewModel` saat membuat `Command` — `correlationId: corr_<timestamp>_<random>` (via `createCommand`).
- **Propagated:** `Command → Facade → Service → Adapter → Authority → Event` — semua event yang berasal dari command membawa `correlationId` yang sama.
- **Used for:** Tracing `Create Task` → `ExecutionCreated` → `SyncStatusChanged` → `DashboardUpdate` tanpa Store chain. Logging correlation, bukan untuk deduplication (itu `eventId`).
- **Scope:** Per user action — `onCreateTask` menghasilkan `correlationId` baru, bukan reuse.

## 13. Event ID / Deduplication

- **Event ID:** `eventId: evt_<timestamp>_<random>` — unique per event instance.
- **Deduplication:** Consumer `Store`/`ViewModel` harus dedup via `eventId` set (D08A). Jika `eventId` sudah diproses, ignore.
- **Idempotency:** `Store.set(aggregateId, viewState)` adalah **idempotent** — processing duplicate event tidak mengubah state kedua kali.

## 14. Timestamp Semantics

- **Clock:** Authority clock — `D07`/`D07B`/`D06` generate `timestamp: ISO-8601 UTC`. Feature tidak boleh generate timestamp untuk domain event.
- **Comparison:** `Store` hanya bandingkan `timestamp` untuk **stale detection** — `event.timestamp < store.lastTimestamp` → ignore.
- **Display:** UI memformat `timestamp` via `ViewModel` → `Projection` — tidak ada raw `Date` di `Store`.

## 15. Event Ordering Guarantees

- **Per-aggregate:** Ordered — `ExecutionStateChanged` untuk `executionId` yang sama dijamin ordered oleh `D07` state machine.
- **Cross-aggregate:** Tidak ordered — consumer tidak boleh assume `Execution A Completed` tiba sebelum `Execution B Created`.
- **Facade:** Tidak re-order — meneruskan urutan `Adapter`.
- **Consumer handling:** Gunakan `version` dan `timestamp` untuk stale check, bukan arrival order.

## 16. At-Least-Once vs Exactly-Once

- **Guarantee:** **At-least-once** — `D07`/`D07B` retry, reconnect, `SyncTransport`, `EventBus` in-memory (saat ini) semuanya at-least-once.
- **Consumer must handle:** Duplicate via `eventId` dedup + idempotent `Store.set` — **exactly-once effect** dicapai via dedup, bukan via transport guarantee.
- **No exactly-once transport:** D10A tidak menjanjikan exactly-once — jika ada yang butuh exactly-once, itu `D07B` SyncQueue idempotency (dedup di authority).

## 17. Stale-State Handling

- **Definition:** Event/state dengan `timestamp` atau `version` lebih lama dari yang sudah di-store adalah stale.
- **Policy:** **Ignore** — `if (event.timestamp < store.lastTimestamp) return;` atau `if (event.version < store.lastVersion) return;`.
- **ViewModel:** Tidak boleh overwrite `Store` dengan stale `refresh()` result jika ada `subscribe` yang lebih baru — gunakan `AbortController` untuk cancel stale flight.

## 18. Race-Condition Policy

- **Scenario:** `TasksViewModel.onCreateTask(A)` dan `onCreateTask(B)` concurrent — dua `Facade.executeTask` flight.
- **Policy:** `ViewModel` **tidak** queue — `Facade`/`D07` yang queue (D07A Scheduler). `ViewModel` hanya `store.setLoading(true)` untuk A, lalu B — `D07` menjamin ordering via `SyncQueue`.
- **UI:** `canSubmit` false selama `isLoading` — mencegah double-submit (D08A). Jika double-submit tetap terjadi, `D07B` idempotency via `commandId` menangani.

## 19. Abort / Cancellation Propagation

- **ViewModel → Facade:** `ViewModel.dispose()` → `abortController.abort()` — `facade.*` promise reject dengan `ABORTED` — `ViewModel` set `store.isLoading = false` tanpa error.
- **Facade → Authority:** `abort` **tidak** membatalkan `Command` yang sudah dikirim ke authority — authority cancellation adalah `CancelTask` command terpisah.
- **Event:** `abort` tidak menghasilkan `Event` — hanya ViewModel local.

## 20. Error Propagation

- **Authority → Adapter → Facade → ViewModel → Store → UI:** `ApplicationError { code, messageKey, retryable, correlationId }` — tidak ada `throw` raw.
- **ViewModel:** Meneruskan `messageKey` ke `Store.error` — tidak membuat `message` sendiri.
- **Retryable:** `retryable: true` hanya dari authority (`D07`/`D07B`) — ViewModel tidak memutuskan `network error → retryable`.
- **Cross-feature:** `ExecutionFailed` event membawa `error` — `Dashboard` menampilkan `failedCount` increment, bukan retry.

## 21. Loading Propagation

- **Per-feature:** `Store.isLoading` hanya untuk feature itu — `TasksStore.isLoading` tidak memengaruhi `DashboardStore.isLoading`.
- **Cross-feature:** `SyncViewState.status === "SYNCING"` adalah loading untuk `Sync` saja — `Dashboard` menampilkannya sebagai `◐` tanpa `isLoading` global.
- **Facade:** Tidak ada global loading — `Facade.getDashboard` vs `getSyncStatus` adalah independent promises.

## 22. Empty-State Propagation

- **Per-feature:** `Store` mendefinisikan `empty` (§5.3) — UI render `EmptyView` jika `items.length===0`.
- **Cross-feature:** `DashboardEmpty` tidak bergantung pada `TasksStore` — `DashboardStore` menentukan empty via `Facade.getDashboard().recentActivity.length`.
- **No cross empty:** `MemoryEmpty` tidak memengaruhi `TasksEmpty`.

## 23. Subscription Ownership

- **Owner:** `ViewModel` owns `unsubscribe` — `startObserving()` creates, `stopObserving()` / `dispose()` destroys.
- **Store:** Tidak pernah subscribe — `Store` hanya `set()` + `subscribe(listener)` untuk UI.
- **Facade:** `Facade.observeSync` mengembalikan `() => void` unsubscribe — `ViewModel` menyimpan dan memanggil saat `dispose`.
- **Leak prevention:** Setiap `subscribe` harus ada `unsubscribe` di `dispose()` — di-test via `D10A` lifecycle test.

## 24. Disposal Guarantees

- **Idempotent:** `ViewModel.dispose()` dapat dipanggil berkali-kali — kedua kalinya no-op.
- **Abort + Unsubscribe:** `dispose()` harus `abortController?.abort()` dan `unsubscribe?.()` — tidak ada `isLoading` yang tertinggal true.
- **Store remains:** `Store` tidak di-`clear()` saat `ViewModel.dispose()` — projection tetap untuk re-mount tanpa re-fetch (kecuali process death).

## 25. Process-Death Recovery

- **Store is volatile:** `Store` hilang saat process death — `Authority` (D07/D05) adalah durable (InsForge/IndexedDB).
- **Recovery contract:** `ViewModel` baru harus `refresh() → Facade.query Authority → Store.set()` — bukan `localStorage` restore. `Store.reset()` adalah valid state.
- **Example:** `ExecutionViewModel` setelah restart: `store.get(id) === undefined` → `refresh(id) → Facade.getExecution(id) → store.set(viewState)` — UI menampilkan loading lalu data.

## 26. Offline / Reconnect Behavior

- **Source:** `SyncStore.status` adalah **projection** `D07B` — `OFFLINE` adalah valid state (D08, D09 §159), bukan error.
- **Offline write:** `TasksViewModel.onCreateTask` tetap `facade.executeTask` — yang akan `LOCAL_SUCCESS → PENDING_SYNC` (D07B) — ViewModel tidak tahu offline.
- **Reconnect:** `SyncViewModel.startObserving()` akan menerima `SyncStatusChanged { status: SYNCING }` → `SyncStore.set`.
- **UI:** Menampilkan `○ OFFLINE - Saved locally` (D08) via `SyncViewState.status`, bukan `ViewModel` decision.

## 27. Cross-Feature Cycle Prevention

- **Static:** `arch-lint` `no-circular` — cross-layer cycle FAIL. Cycle `features/dashboard → features/tasks → features/dashboard` adalah FAIL karena `features/*` adalah layer yang sama tetapi prefix berbeda — `isCrossLayerCycle` menangkap.
- **Dynamic:** Event `Execution → Sync → Dashboard → Execution` tidak boleh membuat loop — `Dashboard` tidak boleh produce `ExecuteTask` kembali. D10A invariants (§9) memastikan graph asiklik.
- **Review:** Setiap interaction baru harus di-review dan di-tambah ke §4 graph — jika menambah edge `Memory → Tasks`, D10A direvisi dan di-LOCK.

## 28. Forbidden Direct Store Access

| Forbidden | Enforced By | Why |
|-----------|-------------|-----|
| `DashboardViewModel → TasksStore` | `dependency-direction` (ViewModel → Store feature lain) | Ownership violation — dashboard tidak boleh baca tasks cache |
| `TasksViewModel → ExecutionStore` | `forbidden-import` | Tasks bukan owner Execution |
| `MemoryViewModel → DashboardStore` | `public-boundary` | Memory isolated |
| `features/*/ui → features/*/stores` (value, not type) | `dependency-direction` (UI → Store value) | UI hanya via ViewModel |
| `features/*/stores → features/*/stores` | `store → shared only` | Store tidak boleh import Store lain |

**Allowed cross-feature read:** Hanya via `Facade` query/event — contoh benar `DashboardViewModel → Facade.getDashboard()` yang compose `D07 + D07B`.

## 29. Forbidden Event Mutation

- Event adalah **immutable** — `const event: Readonly<ApplicationEvent>` — consumer tidak boleh `event.payload.status = "FOO"`.
- Mutation hanya pada `Store` projection milik consumer — `store.set({...viewState, status: "FOO"})` jika diperlukan mapping, bukan `event.payload.status = ...`.
- `Adapter` tidak boleh mutate `D07` event sebelum pass ke `Facade` — hanya translate type.

## 30. Test Scenarios untuk Setiap Interaction Path

### 30.1 Tasks → Execution → Sync → Dashboard (canonical)

```ts
// FakeFacade traces correlationId
const facade = new FakeApplicationFacade(); // implements executeTask, getExecution, getDashboard, observeSync
const tasksStore = new TasksStore();
const tasksVM = new TasksViewModel(facade, tasksStore, userContext);
const execStore = new ExecutionStore();
const execVM = new ExecutionViewModel(facade, execStore, userContext);
const syncStore = new SyncStore();
const syncVM = new SyncViewModel(facade, syncStore, userContext);
const dashStore = new DashboardStore();
const dashVM = new DashboardViewModel(facade, dashStore, userContext);

// 1. Create Task
const { executionId } = await tasksVM.onCreateTask("goal");
assert(facade.lastCommand.type === "ExecuteTask" && facade.lastCommand.correlationId != null);

// 2. Authority produces ExecutionCreated (simulate)
facade.emitEvent({ eventType: "ExecutionStateChanged", aggregateId: executionId, correlationId: facade.lastCommand.correlationId });
assert(execStore.get(executionId)?.status === "RUNNING");

// 3. Authority produces SyncStatusChanged
facade.emitEvent({ eventType: "SyncStatusChanged", payload: { status: "SYNCING" } });
assert(syncStore.get().status === "SYNCING");

// 4. Dashboard reflects aggregate
await dashVM.load();
assert(dashStore.get().execution.active === 1);
assert(dashStore.get().sync.status === "SYNCING");
```

### 30.2 Duplicate Event (idempotency)

```ts
const event = { eventId: "evt_1", eventType: "ExecutionCompleted", aggregateId: "exec_1", correlationId: "corr_1" };
facade.emitEvent(event);
facade.emitEvent(event); // duplicate
assert(execStore.get("exec_1")?.status === "COMPLETED"); // only once
```

### 30.3 Stale Event (ignore)

```ts
store.set({ executionId: "exec_1", status: "COMPLETED", timestamp: "2026-09-12T10:00:02Z" });
facade.emitEvent({ eventType: "ExecutionStateChanged", aggregateId: "exec_1", payload: { status: "RUNNING" }, timestamp: "2026-09-12T10:00:01Z" });
assert(store.get("exec_1")?.status === "COMPLETED"); // stale RUNNING ignored
```

### 30.4 Process Death Recovery

```ts
// Simulate new ViewModel after store cleared
execStore.clear();
assert(execStore.get("exec_1") === undefined);
await execVM.refresh("exec_1"); // queries Facade.getExecution → D07
assert(execStore.get("exec_1") !== undefined);
```

### 30.5 Offline Transition

```ts
facade.emitEvent({ eventType: "SyncStatusChanged", payload: { status: "OFFLINE" } });
assert(syncStore.get().status === "OFFLINE");
await tasksVM.onCreateTask("goal while offline");
assert(facade.lastCommand.type === "ExecuteTask"); // still goes to Facade, not blocked
```

### 30.6 Race & Abort

```ts
const p1 = tasksVM.onCreateTask("A");
const p2 = tasksVM.onCreateTask("B");
tasksVM.dispose(); // aborts both? — ViewModel abort only affects isLoading, not Commands already sent
assert(tasksStore.get().isLoading === false);
```

### 30.7 Forbidden Store Access (must FAIL lint)

```ts
// In DASHBOARD ViewModel: import { TasksStore } from "../tasks/stores/TasksStore" → arch-lint FAIL
// In TASKS ViewModel: import { SyncQueue } from "../../sync/SyncQueue" → FAIL
```

## 31. D10A Tidak Menjadi Authority Baru

- D10A tidak memiliki `class InteractionEngine` atau `class SyncQueue` — enforcement tetap `D07/D07B`.
- D10A tidak mengubah `ALLOWED_IMPORTS` — `UI → ViewModel → Facade` tetap. Jika D10A butuh `features/memory → features/dashboard` edge, D10A harus merevisi D10 dan D09A terlebih dahulu, tidak diam-diam menambah `ALLOWED_IMPORTS`.
- D10A tidak mendefinisikan implementasi adapter nyata — `Fake*Adapter` tetap, Real Adapter di `D11`.

## 32. Implementation — File Kontrak

### 32.1 New Shared Interaction Contracts

```
src/core/application/interaction/               ← new — shared layer (D10A)
├── types/
│   ├── Correlation.ts      — CorrelationContext { correlationId, causationId, eventId }, createCorrelation()
│   ├── InteractionEvents.ts — InteractionEvent<T> + EventNames (ExecutionCreated, SyncStatusChanged, ...)
│   └── InteractionState.ts  — Reconciliation helpers (isStale, dedup set)
├── InteractionBus.ts        — Typed EventBus for D10A (wrapper over D09 EventBus)
├── Lifecycle.ts             — LifecycleContract { mount, initialize, subscribe, active, suspend, resume, dispose }
├── Reconciliation.ts        — stale check, dedup, ordering helpers
└── index.ts                 — barrel
```

**Semua file di `interaction/` adalah `shared` layer** — `src/core/application/(types|events|di|interaction)` — sehingga `features/*` dapat import tanpa melanggar `D09A`.

### 32.2 Per-Feature Contracts (tidak perlu file baru)

`D10` ViewState/Commands sudah ada — D10A hanya **menambah contract interaction** di dokumen, tidak menambah `src/features/*/interaction` — feature tetap `ui/viewmodels/stores`, interaction via `Facade` + `InteractionBus` melalui `Facade`.

## 33. Tooling & Gate

- **Config update:** `tools/arch-lint/config.mjs` LAYERS `shared` pattern diperluas `types|events|di|interaction` — agar `features/*` dapat import `interaction/*` tanpa FAIL.
- **No `any`:** Semua `InteractionEvent<T>` typed, no `any` — `check-no-any.mjs` harus PASS.
- **Gate:** `npm run check` (`lint:arch + lint:no-any + lint:types`) harus `PASS` — `D09A unchanged`, `D10 unchanged`, `D10A` tidak menambah whitelist.

## 34. Acceptance — D10A-001 s/d D10A-025

| ID | Criteria | Must |
|----|----------|------|
| **D10A-001** | Interaction graph (§4) terdokumentasi — canonical vs forbidden | Dokumen |
| **D10A-002** | `Feature Store = local projection, Facade = coordination, Event = notification, Command = requested, Authority = source` | Dokumen §3 |
| **D10A-003** | Feature tidak membaca Store feature lain — hanya via Facade/Event | LINT + Invariant §9 |
| **D10A-004** | Event producer hanya Authority (D07/D07B/D06/D05) — feature hanya produce Command | Dokumen §5.1 |
| **D10A-005** | Event payload typed, immutable, tidak berisi Store shape | Review |
| **D10A-006** | Per-aggregate ordered, cross-aggregate tidak ordered — stale check via timestamp/version | §5.4 + §17 |
| **D10A-007** | Duplicate handling at-least-once → idempotent via `eventId` dedup | §5.5 + §16 |
| **D10A-008** | Stale event ignored via timestamp/version | §17 |
| **D10A-009** | Subscription ownership di ViewModel, Store tidak subscribe | §5.7 + §23 |
| **D10A-010** | Source of truth di Authority, projection di Store, derived di Facade | §6 |
| **D10A-011** | Reconciliation via Facade, bukan ViewModel | §6.4 |
| **D10A-012** | Rehydration via `refresh() → Facade.query` setelah process death | §6.6 + §25 |
| **D10A-013** | Offline `OFFLINE` adalah valid state, write tetap `Facade` | §6.7 + §26 |
| **D10A-014** | Command hanya dari ViewModel, dieksekusi Facade, correlationId propagated | §7 |
| **D10A-015** | Lifecycle `mount → initialize → subscribe → active → suspend/resume → dispose` | §8 |
| **D10A-016** | Naming conventions Event (PastTense) dan Command (Imperative) | §10-11 |
| **D10A-017** | CorrelationId & EventId & deduplication terdokumentasi | §12-13 |
| **D10A-018** | Timestamp semantics & ordering guarantees | §14-15 |
| **D10A-019** | Race, abort, error, loading, empty-state propagation mendidik | §18-22 |
| **D10A-020** | Disposal idempotent, abort + unsubscribe | §24 |
| **D10A-021** | Cross-feature cycle prevention — static + dynamic asiklik | §27 |
| **D10A-022** | Forbidden direct Store access & forbidden event mutation | §28-29 |
| **D10A-023** | Test scenarios per interaction path (§30) — canonical, duplicate, stale, recovery, offline, race | Test |
| **D10A-024** | D10A tidak menjadi authority baru, tidak mengubah D09A/D10 | §31 |
| **D10A-025** | Implementation `src/core/application/interaction/*` sebagai shared, gate PASS 0 whitelist | §32-33 + `npm run check` |

---

**Status Dokumen:** **LOCKED 12 September 2026 19:05 WIB** — `D10A` kini **authoritative interaction/state contract** untuk semua cross-feature. `D11` (Real Adapter Integration) baru mengganti `Fake*Adapter` via DI — tanpa mengubah `ViewModel/Store/UI/Event`. Langkah selanjutnya: `D11 Contract → LOCK D11 → Draft PR`.

**Invariant:** `Features do not read each other's Stores. They meet at Facade, talk with Commands, listen with Events, and trust Authorities for truth.`
