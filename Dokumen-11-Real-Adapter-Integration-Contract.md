# Dokumen 11 — Real Adapter Integration Contract

| Field | Value |
|-------|-------|
| **Kode** | D11 |
| **Judul** | Real Adapter Integration Contract |
| **Versi** | 1.0 — **LOCKED** |
| **Tanggal** | 12 September 2026 — **LOCKED 12 September 2026 19:30 WIB** |
| **Parent** | D10A Feature Interaction / State Contracts — **LOCKED 12 Sep 2026 19:05 WIB** |
| **Depends On** | D00 Constitution, D05 Memory, D06 Android, D07 Execution, D07A Scheduler, D07B SyncQueue, D09 Frontend Application Contract, D09A Lint Enforcement, D10 Feature Contracts, D10A Interaction/State Contracts |
| **Scope** | `Adapter Contract → Real Adapter → External System` per authority (D05/D06/D07/D07A/D07B) — preservation `D10A interaction contracts` + `ViewModel/Store/UI unchanged` |
| **Sifat** | **Integration Contract — mengganti implementation boundary Fake→Real via DI, tidak menciptakan authority baru — AUTHORITATIVE** |
| **Status** | **LOCKED** — gate PASS (83 files, 0 violations, 0 whitelist) — D09/D10/D10A unchanged |

> **Prinsip:** `UI → ViewModel → Facade → Service → Adapter Contract → Real Adapter → External System / Platform` — `D10A interaction contracts tetap, ViewModel/Store/UI tidak berubah, FakeAdapter → RealAdapter melalui DI. Authority tetap D00–D10A.`

---

## 1. Tujuan

D10A telah mengunci **bagaimana feature berinteraksi dengan aman** (`83 files PASS`, 0 whitelist). Sebelum menulis satu baris `Draft PR` pun, **batas integration harus dikunci** agar `Fake*Adapter` diganti `Real*Adapter` **hanya di batas Adapter**, bukan dengan menyelundupkan `Android Intent` ke `ViewModel` atau `SyncQueue` ke `Store`.

Jika tidak dikunci, `Real Adapter Integration` akan mencampur `contract validation` dengan `runtime integration` — saat failure sulit menentukan apakah masalah ada di `boundary`, `DI`, `adapter contract`, atau `authority D05–D07B` (persis alasan Anda menunda D11 implementation hingga kontrak LOCK).

D11 mengunci:

- Posisi `Adapter Contract` sebagai **stable boundary** antara `Service` dan `External System`.
- Kontrak per authority (`Memory, Android, Execution, Scheduler, Sync`) — `Contract → Real → External`.
- Strategi `DI` replacement `Fake → Real` tanpa mengubah `Facade/Service/ViewModel/Store/UI`.
- Preservasi `D10A` (`correlationId, eventId, ordering, dedup, stale, lifecycle, offline, cycle`) dan `D10` (`ViewState, Loading, Empty`).
- Larangan menjadi authority baru dan aturan `no any`, `no direct Store`.

D11 adalah **contract, bukan Draft PR**. Tidak ada `npm install insforge` atau `new SyncQueue()` di feature — hanya kontrak yang akan diimplementasi setelah `D11 LOCK`.

## 2. Kedudukan dalam Hierarki

```
D09  → HOW application coordinates (Facade → Service → Adapter Contract)
D09A → ENFORCE dependency direction (gate — 83 files PASS)
D10  → WHAT each feature promises (6 features × ViewState)
D10A → HOW features interact safely (LOCKED — correlation, lifecycle, invariants)
D11  → Real Adapter Integration Contract ← THIS DOCUMENT
        Adapter Contract → Real Adapter → External System per authority
        ViewModel/Store/UI unchanged, D10A contracts preserved, Fake→Real via DI
D12  → Draft PR / Implementation (setelah D11 LOCK)
```

- **Subordinate:** D11 tunduk pada D00–D10A. Jika D11 bertentangan (mis. mengusulkan `ViewModel → Android SDK`), D00–D10A menang dan D11 direvisi.
- **No New Authority:** D11 tidak menciptakan `SyncEngine`, `MemoryManager`, atau `SchedulerService` baru — authority tetap `D05/D06/D07/D07A/D07B`.
- **Implementation Boundary:** Satu-satunya yang berubah adalah **isi** `Adapter` (Fake → Real) — **interface** `Adapter Contract` tidak berubah.

## 3. Prinsip Utama D11

| # | Invariant | Enforced By |
|---|-----------|-------------|
| 1 | `UI → ViewModel → Facade → Service → Adapter Contract → Real Adapter → External System` — tidak ada panah yang memotong | `D09A` `dependency-direction` + `forbidden-import` |
| 2 | `D10A interaction contracts tetap` — `correlationId, eventId, ordering, dedup, stale, at-least-once, lifecycle, offline` tidak berubah | D11 §7 |
| 3 | `ViewModel/Store/UI tidak berubah` — `TasksViewModel.onCreateTask` tetap `facade.executeTask`, `SyncStore` tetap projection | D11 §8 |
| 4 | `FakeAdapter → RealAdapter melalui DI` — `Container` mengganti binding `TOKENS.*Adapter`, feature tidak tahu | D11 §5 |
| 5 | `Adapter tidak mengubah semantics authority` — `ExecutionAdapter` hanya translate `D07 Execution → Result<ExecutionViewState>`, tidak memutuskan `RETRY` | D09 §21-26 |
| 6 | `No Any, No Direct Authority` — `RealAdapter` juga typed, tidak ada `new SyncQueue()` di feature | `no-any`, `di-only`, `authority-ownership` |
| 7 | `Authority tetap D00–D10A` — D11 hanya mengganti transport/storage, bukan state machine | D11 §9 |

## 4. Adapter Contract Layer — Stable Boundary

```
                 D09/D10/D10A (unchanged)
┌──────────────────────────────────────────────┐
│  UI → ViewModel → Facade → Service           │  ← application/orchestration
│         │         │         │                │
│         │         │         └─► Adapter Contract  ← stable interface (D11 §4.1)
└─────────┼─────────┼─────────┼────────────────┘
          │         │         │
          │         │         └─────► Real Adapter (implements contract) ──► External System
          │         │                    │  D05: InsForge / VectorStore
          │         │                    │  D06: Android Platform (NativeBridge/Capacitor)
          │         │                    │  D07: ExecutionEngine (in-memory + repo)
          │         │                    │  D07A: Scheduler (WorkManager/Alarm)
          │         │                    │  D07B: SyncQueue + SyncTransport (InsForge)
          │         │
          │         └───────────── (ViewModel/Store/UI tidak tahu Real vs Fake)
          │
          └───────────────────── (InteractionBus, Lifecycle, Reconciliation tetap)
```

**Adapter Contract** adalah **interface** (`ExecutionAdapter`, `SyncAdapter`, dll.) di `src/core/application/adapters/*` — **tidak berubah di D11**. Yang berubah hanya **implementation** yang di-bind di `Container`.

### 4.1 Adapter Contract vs Real Adapter

| Konsep | Lokasi | Contoh | Berubah di D11? |
|--------|--------|--------|-----------------|
| `Adapter Contract` | `src/core/application/adapters/*.ts` — interface | `interface SyncAdapter { getSyncStatus(userId): Promise<Result<SyncStatus>> }` | **TIDAK** — stable |
| `Fake Adapter` | `src/core/application/adapters/*.ts` — `class FakeSyncAdapter implements SyncAdapter` | In-memory stub untuk test & scaffolding | ** diganti** via DI, tidak dihapus (tetap untuk test) |
| `Real Adapter` | `src/infrastructure/adapters/*` atau `src/core/application/adapters/real/*` — implements same interface | `class InsForgeSyncAdapter implements SyncAdapter` | **BARU** — implementasi D11 |
| `External System` | `src/core/*` authority atau `infrastructure/*` | `SyncQueue`, `InsForge SDK`, `Android Platform` | Tidak di-feature |

## 5. DI Replacement Strategy — Fake → Real Tanpa Ubah Feature

```ts
// src/core/application/bootstrap.ts — satu-satunya tempat `new` diizinkan (D09A di-only)
export function bootstrapApplication(env: "test" | "development" | "production") {
  const c = createApplicationContainer();
  const eventBus = new InMemoryEventBus();
  c.registerInstance(TOKENS.EventBus, eventBus);
  c.registerInstance(TOKENS.InteractionBus, new InMemoryInteractionBus());

  if (env === "test") {
    c.registerInstance(TOKENS.ExecutionAdapter, new FakeExecutionAdapter());
    c.registerInstance(TOKENS.SyncAdapter, new FakeSyncAdapter());
    // ... Fake semua — untuk unit test ViewModel
  } else {
    // D11 — Real adapters, same contracts, no ViewModel change
    c.registerInstance(TOKENS.ExecutionAdapter, new RealExecutionAdapter(
      c.resolve(TOKENS.ExecutionEngine), // D07 authority — di-inject, bukan new di feature
      c.resolve(TOKENS.ExecutionRepository)
    ));
    c.registerInstance(TOKENS.SyncAdapter, new RealSyncAdapter(
      c.resolve(TOKENS.SyncQueue),       // D07B authority
      c.resolve(TOKENS.SyncTransport)    // InsForge transport
    ));
    c.registerInstance(TOKENS.MemoryAdapter, new RealMemoryAdapter(
      c.resolve(TOKENS.MemoryRepository), // D05
      c.resolve(TOKENS.EmbeddingService)
    ));
    c.registerInstance(TOKENS.AndroidAdapter, new RealAndroidAdapter(
      c.resolve(TOKENS.NativeBridge)      // D06
    ));
    c.registerInstance(TOKENS.SchedulerAdapter, new RealSchedulerAdapter(
      c.resolve(TOKENS.Scheduler)         // D07A
    ));
  }
  // Services, Facade, Stores, ViewModels — tidak berubah
  // ...
  return { container: c, facade: c.resolve(TOKENS.ApplicationFacade) };
}
```

**Aturan DI (dienforce D09A):**
- `ViewModel`, `Store`, `UI` **dilarang** `new RealSyncAdapter` — hanya `bootstrap.ts` dan `di/*`.
- `TOKENS.*Adapter` adalah **indirection** — `ViewModel → Facade → Service → TOKENS.*Adapter → Real|Fake`.
- `Fake*` tetap ada untuk `npm run check` dan unit test — tidak dihapus.

## 6. Per Authority — Contract → Real → External

### 6.1 D05 Memory — `MemoryAdapter`

**Contract (unchanged, D09 §25):**
```ts
interface MemoryAdapter {
  createMemory(payload: { content: string; type: string; userId: string }): Promise<Result<{ id: string }>>;
  searchMemory(params: { query: string; topK?: number; userId: string }): Promise<Result<MemoryViewState[]>>;
  getMemory(id: string, userId: string): Promise<Result<MemoryViewState>>;
}
```

**Real Adapter:** `RealMemoryAdapter` di `src/infrastructure/adapters/RealMemoryAdapter.ts` implements `MemoryAdapter`.

**External System:**
- `D05 MemoryRepository` (InsForge/IndexedDB) + `EmbeddingService` (D05 authority) — embedding & policy tetap `D05`, bukan Adapter.
- Adapter hanya **translate**: `MemoryViewState` (projection) ↔ `D05 MemoryEntity`.

**Error Mapping:**
- `D05` error `EMBEDDING_FAILED` → `ApplicationError { code: "MEMORY_EMBED_FAILED", messageKey: "memory.embedFailed", retryable: false }`
- `OFFLINE` dari `D07B` tidak pernah muncul di Memory — Memory adalah local-first, `createMemory` selalu `LOCAL_SUCCESS` lalu `SyncQueue` yang sync.

**Idempotency/Offline:** `createMemory` → `Repository.create` → `D07B enqueue` — bukan `MemoryAdapter` yang enqueue, melainkan `Repository` impl (boundary D09 §18-20).

**Interaction Preservation:** `MemoryCreated` event tetap via `InteractionBus` — `RealMemoryAdapter` tidak mengubah `eventType`.

### 6.2 D06 Android — `AndroidAdapter`

**Contract (unchanged, D09 §26):**
```ts
interface AndroidAdapter {
  getInstalledApps(userId: string): Promise<Result<AndroidAppInfo[]>>;
  openApp(packageName: string, userId: string): Promise<Result<void>>;
  getPermissionState(permission: string, userId: string): Promise<Result<{ state: "GRANTED"|"DENIED" }>>;
}
```

**Real Adapter:** `RealAndroidAdapter` di `src/infrastructure/adapters/RealAndroidAdapter.ts`.

**External System:**
- `D06 NativeBridge` → `Android Platform` (`PackageManager`, `Intent`, `Activity`) — via `Capacitor`/`NativeBridge` (D06 §6).
- Adapter **tidak** memanggil `startActivity` langsung di ViewModel — hanya via `NativeBridge` yang di-mock di test.

**Error Mapping:**
- `PackageManager.NameNotFoundException` → `{ messageKey: "android.appNotFound" }`
- `Permission Denied` → `{ messageKey: "android.permissionDenied", retryable: false }`

**Interaction Preservation:** `AndroidAppListChanged` event tidak ada cross-feature — Dashboard tidak auto-refresh apps — harus `ViewModel.loadApps()` manual (§6.6 D10).

### 6.3 D07 Execution — `ExecutionAdapter`

**Contract (unchanged, D09 §21-22):**
```ts
interface ExecutionAdapter {
  execute(plan: unknown, context: unknown): Promise<Result<{ executionId: string }>>;
  getExecution(id: string, userId: string): Promise<Result<ExecutionViewState>>;
  observeExecution(id: string, userId: string, cb: (s: unknown)=>void): () => void;
  pause(id: string, userId: string): Promise<Result<void>>;
}
```

**Real Adapter:** `RealExecutionAdapter` di `src/infrastructure/adapters/RealExecutionAdapter.ts`.

**External System:**
- `D07 ExecutionEngine` + `ExecutionRepository` + `StepExecutor` + `PermissionGate` + `VerificationManager` — semua authority (D07). Adapter hanya **facade** untuk `ExecutionEngine.execute()`.

**Semantics Preservation:**
- `RUNNING → PAUSED → COMPLETED` tetap `D07 ExecutionStateMachine` — Adapter tidak memutuskan `RETRY`.
- `RealExecutionAdapter.execute()` → `ExecutionEngine.execute(plan, context)` → `Result` → `Adapter` map `Execution → ExecutionViewState` (D10 §8.5) — **projection, bukan raw**.

**Error Mapping:**
- `D07` `PERMISSION_DENIED` → `{ messageKey: "execution.permissionDenied", retryable: false }` (D07 §40)
- `TIMEOUT` → `{ messageKey: "execution.timeout", retryable: true }`

**Observation:** `observeExecution` di Real membungkus `ExecutionEngine.onStateChanged` → `InteractionBus.publish(ExecutionStateChanged)` — ViewModel tetap `ViewModel.observe(id)` tanpa tahu `ExecutionEngine`.

### 6.4 D07A Scheduler — `SchedulerAdapter`

**Contract (unchanged, D09 §23):**
```ts
interface SchedulerAdapter {
  schedule(plan: unknown, opts: { priority?: string }): Promise<Result<{ executionId: string }>>;
  cancelSchedule(id: string, userId: string): Promise<Result<void>>;
}
```

**Real Adapter:** `RealSchedulerAdapter`.

**External System:**
- `D07A Scheduler` + `WorkManager`/`AlarmManager` (Android) — via `D07A` authority. Adapter hanya translate `priority: CRITICAL → expedited`.

**Preservation:** `Scheduler` tidak ada UI di D10 — Dashboard hanya menampilkan `queued/running` dari `Facade.getDashboard` — bukan langsung `SchedulerAdapter`.

### 6.5 D07B Sync — `SyncAdapter` (Paling Kritis — Offline-First)

**Contract (unchanged, D09 §24):**
```ts
interface SyncAdapter {
  getSyncStatus(userId: string): Promise<Result<SyncStatus>>;
  observeSync(userId: string, cb: (s: SyncStatus)=>void): () => void;
  requestSync(userId: string): Promise<Result<void>>;
  getPending(userId: string): Promise<Result<unknown[]>>;
  getConflicts(userId: string): Promise<Result<unknown[]>>;
}
```

**Real Adapter:** `RealSyncAdapter` di `src/infrastructure/adapters/RealSyncAdapter.ts`.

**External System:**
- `D07B SyncQueue` (durable, idempotent, ordered, backoff+jitter) + `SyncTransport` (InsForge transport) — authority (D07B).
- Adapter membungkus `SyncQueue.observeStatus` → `InteractionBus SyncStatusChanged` — **at-least-once**, dedup di `DeduplicationSet` (§5.5 D10A).

**Offline/Online:**
- `RealSyncAdapter.getSyncStatus()` → `SyncQueue.getStatus(userId)` — `OFFLINE` adalah valid `SyncViewState.status`, bukan error.
- `requestSync()` → `SyncQueue.flush()` — bukan `fetch` langsung.

**Error Mapping:**
- `SyncQueue` `CONFLICT` → `SyncStatus { status: "ATTENTION", conflictCount: N }`
- `NetworkError` → `{ messageKey: "sync.networkError", retryable: true }`

**Interaction Preservation:** `SyncStatusChanged` tetap via `InteractionBus` — `SyncStore` tidak tahu `SyncQueue`, hanya `SyncViewState` dari `Adapter`.

## 7. Preservation of D10A Interaction Contracts

| D10A Contract | D11 Preservation |
|---------------|------------------|
| **Event Naming** `ExecutionCreated` (PastTense) | `RealExecutionAdapter` tetap publish `ExecutionCreated` — tidak menjadi `CreateExecution` |
| **CorrelationId** `corr_xxx` per Command | `Real*Adapter` meneruskan `correlationId` dari `Command` → `Event` — `ViewModel` generate, adapter propagate, tidak invent |
| **EventId dedup** `evt_xxx` | `RealSyncAdapter` emit `eventId` baru per `SyncStatusChanged` — `DeduplicationSet` di `ViewModel/Store` tetap |
| **Ordering** per-aggregate ordered | `RealExecutionAdapter.observeExecution` tetap ordered per `executionId` — tidak re-order |
| **Stale check** via `timestamp/version` | `isStale()` tetap — `RealAdapter` tidak mengubah `timestamp` authority |
| **At-least-once → idempotent effect** | `RealSyncAdapter` at-least-once, `Store.set` tetap idempotent |
| **Lifecycle** `mount → dispose` | `ViewModel.dispose()` tetap `abort` + `unsubscribe` — `RealAdapter` `observe*` return `() => void` |
| **Offline** `OFFLINE` valid | `RealSyncAdapter` map `SyncQueue OFFLINE` → `SyncViewState OFFLINE` |
| **Cycle prevention** | `RealAdapter` tidak subscribe `Store` — no `Adapter → Presentation` |

**Verifikasi:** `D10A §30` test scenarios (canonical, duplicate, stale, recovery, offline, race) tetap pass dengan `Real*Adapter` via `Fake*Adapter` swap — karena `Adapter Contract` sama.

## 8. Preservation of ViewModel / Store / UI

**Tidak ada file feature berubah:**

```
src/features/dashboard/viewmodels/DashboardViewModel.ts — load() → facade.getDashboard() — UNCHANGED
src/features/tasks/viewmodels/TasksViewModel.ts — onCreateTask → facade.executeTask — UNCHANGED
src/features/execution/viewmodels/ExecutionViewModel.ts — onPause → facade.pauseTask — UNCHANGED
src/features/memory/viewmodels/MemoryViewModel.ts — onSearch → facade.searchMemory — UNCHANGED
src/features/sync/viewmodels/SyncViewModel.ts — startObserving → facade.observeSync — UNCHANGED
src/features/android/viewmodels/AndroidViewModel.ts — loadApps → facade.getInstalledApps — UNCHANGED

src/features/*/stores/*.ts — hanya shared types — UNCHANGED
src/features/*/ui/*.ts — mapToScreenState — UNCHANGED
```

**Bukti:** `npm run check` setelah D11 implementation harus tetap `arch-lint PASS` dengan file feature yang **identik byte-for-byte** — hanya `bootstrap.ts` dan `src/infrastructure/adapters/*` yang berubah.

**Forbidden di D11:**
- `RealAdapter` import `ViewModel`/`Store` → FAIL `Adapter → Presentation`
- `ViewModel` import `RealSyncAdapter` → FAIL `ViewModel → Adapter`
- `ViewModel` import `SyncQueue` → FAIL `ViewModel → Authority`

## 9. No New Authority

| Authority | Owner | D11 Role |
|-----------|-------|----------|
| Memory | `D05` | `RealMemoryAdapter` hanya `MemoryRepository` wrapper |
| Android | `D06` | `RealAndroidAdapter` hanya `NativeBridge` wrapper |
| Execution | `D07` | `RealExecutionAdapter` hanya `ExecutionEngine` wrapper |
| Scheduler | `D07A` | `RealSchedulerAdapter` hanya `Scheduler` wrapper |
| Sync | `D07B` | `RealSyncAdapter` hanya `SyncQueue` + `Transport` wrapper |

Jika D11 menemukan kebutuhan domain baru (mis. `BiometricAuth`), bukan D11 yang membuatnya — buat `D06A`/`D12` dan expose via `Adapter`, D11 tetap wrapper.

## 10. Dependency Rules — Dienforce D09A

```
features/*/ui ──→ features/*/viewmodels, features/*/stores(type), facade, shared — UNCHANGED
features/*/viewmodels ──→ facade, stores, shared, interaction — UNCHANGED
src/infrastructure/adapters/* (Real*Adapter) ──→ authority, repository, infrastructure, shared — allowed as Adapter
src/core/application/adapters/* (Contract) ──→ shared only (interface)
```

**Public Boundary tetap:** `features/*` hanya boleh `ApplicationFacade` barrel — tidak boleh `RealSyncAdapter`.

**Cross-feature Store:** `dashboard → tasks Store` tetap **FORBIDDEN** (D10A §28) — `RealAdapter` tidak membuka hole.

## 11. Configuration & Environment

```ts
// .env (tidak di-commit, hanya di device)
INSFORGE_URL=...
INSFORGE_ANON_KEY=...
ANDROID_SDK_VERSION=...

// bootstrap.ts memilih Real vs Fake via env
const env = import.meta.env.MODE === "test" ? "test" : "production";
```

- **Secrets tidak di Store** — `InsForge` key hanya di `Infrastructure` Adapter, tidak di `Store/UI` (D09 §37, §64).
- **Offline first:** `RealSyncAdapter` selalu `LOCAL_SUCCESS` dulu, baru `SyncTransport` — ViewModel tidak tahu.

## 12. Observability — Event Propagation Preservation

- `RealExecutionAdapter` emit `ExecutionStateChanged` → `InteractionBus` → `ExecutionStore` — sama persis dengan `Fake`.
- `RealSyncAdapter` emit `SyncStatusChanged` → `SyncStore` — `Dashboard` tetap via `Facade.getDashboard`.
- **Correlation tracing:** `Create Task` `corr_1` dapat di-trace `ExecuteTask → ExecutionCreated → SyncStatusChanged` di log `RealAdapter` — tanpa Store chain.

## 13. Testing Strategy

| Layer | Fake | Real | Contract Test |
|-------|------|------|---------------|
| `ViewModel` | `FakeApplicationFacade` (in-memory) — unit test D10 | Tidak perlu Real — ViewModel unchanged | Assert `onCreateTask` → `facade.executeTask` called with `correlationId` |
| `Store` | Pure `store.set` — unit | Tidak perlu Real | Assert `isStale` ignores old event |
| `Adapter` | `FakeSyncAdapter` — `check PASS` | `RealSyncAdapter` integration test dengan `SyncQueue` in-memory + `SyncTransport` mock | **Contract test** — `Adapter Contract` test suite yang pass untuk `Fake` dan `Real` (same `SyncStatus` shape) |
| `E2E` | `Fake` + `InteractionBus` — `D10A §30` scenarios | `Real` + `InsForge` staging — same scenarios | Canonical flow `Tasks→Execution→Sync→Dashboard` harus pass di Fake dan Real |

**Contract Test Suite (baru di D11):** `tests/adapter-contract/*` — satu suite yang dijalankan terhadap `Fake*` dan `Real*` — memverifikasi `Adapter Contract` preservation.

## 14. Migration Plan — Fake → Real via DI

1. **D11 LOCK** (this document) — no code change.
2. **Branch `feat/d11-real-adapters`** — buat `src/infrastructure/adapters/Real*.ts` implements `src/core/application/adapters/*` interfaces.
3. **Update `bootstrap.ts`** — `env !== "test"` → `Real*`, `test` → `Fake*` — satu commit.
4. **`npm run check` harus PASS** — 83 + N files, 0 whitelist.
5. **Contract tests** pass untuk `Fake` dan `Real`.
6. **PR** `D11` — reviewer hanya lihat `infrastructure/adapters` + `bootstrap`, tidak ada `features/*` diff.

## 15. Proposed File Structure (D11 — not yet created, only contract)

```
src/core/application/adapters/        ← contracts (unchanged)
├── ExecutionAdapter.ts               ← interface (stable)
├── SyncAdapter.ts
├── MemoryAdapter.ts
├── AndroidAdapter.ts
└── SchedulerAdapter.ts

src/infrastructure/adapters/          ← NEW in D11 implementation (not in D11 contract gate)
├── RealExecutionAdapter.ts           ← implements ExecutionAdapter → D07
├── RealSyncAdapter.ts                ← implements SyncAdapter → D07B
├── RealMemoryAdapter.ts              ← implements MemoryAdapter → D05
├── RealAndroidAdapter.ts             ← implements AndroidAdapter → D06
└── RealSchedulerAdapter.ts           ← implements SchedulerAdapter → D07A

src/core/application/bootstrap.ts    ← only file in application that changes (DI binding)
```

**Gate:** `arch-lint` `shared` includes `interaction` already — `Real*` di `infrastructure/adapters` adalah `Adapter` layer — `allowed: authority, repository, infrastructure, shared` — PASS.

## 16. CI Gate — Preservation

```bash
npm run check
# arch-lint: PASS — scanned 83+N files (N = Real adapters), 0 violations, 0 whitelist
# no-any: PASS
# lint:types: PASS — tsc -p tsconfig.application.json (now includes infrastructure/adapters/**/*.ts)
```

**D11 must not add whitelist** — jika `RealAdapter` perlu `allow-any` untuk SDK boundary, justifikasi `// allow-any — InsForge SDK returns any — narrowed via Zod` di baris itu saja.

## 17. Acceptance — D11-001 s/d D11-020

| ID | Criteria | Must |
|----|----------|------|
| **D11-001** | `Adapter Contract → Real Adapter → External System` per authority terdokumentasi §6 | Dokumen |
| **D11-002** | `RealExecutionAdapter` delegates ke `D07 ExecutionEngine`, tidak memutuskan retry | Review |
| **D11-003** | `RealSyncAdapter` delegates ke `D07B SyncQueue + SyncTransport`, offline valid | Review |
| **D11-004** | `RealMemoryAdapter` delegates ke `D05`, tidak melakukan embedding policy | Review |
| **D11-005** | `RealAndroidAdapter` delegates ke `D06 NativeBridge` | Review |
| **D11-006** | `RealSchedulerAdapter` delegates ke `D07A` | Review |
| **D11-007** | `D10A interaction contracts` preserved (correlation, dedup, stale, lifecycle, offline) | §7 |
| **D11-008** | `ViewModel/Store/UI` unchanged — `git diff src/features` empty after D11 | CI |
| **D11-009** | `Fake → Real` hanya via `DI` (`bootstrap.ts` + `TOKENS`) | §5 |
| **D11-010** | No new authority — authority tetap D00–D10A | §9 |
| **D11-011** | No `any` di feature — `RealAdapter` hanya `allow-any` dengan justifikasi | `no-any` |
| **D11-012** | `arch-lint` PASS — `Adapter → Presentation` tetap FAIL | LINT |
| **D11-013** | `public-boundary` PASS — feature tidak import `Real*` | LINT |
| **D11-014** | `cross-feature Store` tetap FAIL | LINT |
| **D11-015** | `event mutation` tetap FAIL | LINT |
| **D11-016** | Contract tests pass untuk `Fake` dan `Real` (same `SyncStatus` shape) | Test |
| **D11-017** | `D10A` test scenarios (§30) pass dengan `Real*` | Test |
| **D11-018** | Secrets tidak di Store/UI — hanya di `Infrastructure` Adapter | Review |
| **D11-019** | `npm run check` PASS — 0 whitelist | CI |
| **D11-020** | D11 adalah prasyarat Draft PR — tidak ada implementation sebelum LOCK | Process |

---

**Status Dokumen:** **LOCKED 12 September 2026 19:30 WIB** — `D11` kini **authoritative integration contract** — `FakeAdapter → RealAdapter` hanya via `DI`, `D10A` + `D10` tetap, `ViewModel/Store/UI` tidak berubah. Langkah selanjutnya: Draft PR implementation (hanya `src/infrastructure/adapters/*` + `bootstrap.ts`).

**Invariant:** `D10 defines what features promise. D10A defines how they interact. D11 defines how they connect to reality — without touching what they promised.`
