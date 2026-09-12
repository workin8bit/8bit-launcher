# Draft PR — D11 Real Adapter Integration — CHECKLIST

| Field | Value |
|-------|-------|
| **Branch** | `feat/d11-real-adapters` |
| **Base** | `main` (D11 LOCKED 12 Sep 2026 19:30 WIB) |
| **Scope** | `Adapter Contract → Real Adapter → External System` — `Fake → Real` via DI only |
| **Gate** | `npm run check` → `arch-lint PASS 83+N files 0 whitelist` + `no-any PASS` + `lint:types PASS` |
| **Invariant** | `D10A interaction contracts tetap, ViewModel/Store/UI tidak berubah, D11 tidak menjadi authority baru` |

> **Jangan merge sebelum semua kotak tercentang dan CI PASS.** PR ini hanya menyentuh `src/infrastructure/adapters/*` + `bootstrap.ts` (+ contract tests). `src/features/*` harus `git diff` empty.

---

## 0) Pre-flight (sebelum coding)

- [ ] `git checkout main && git pull`
- [ ] `git checkout -b feat/d11-real-adapters`
- [ ] `npm install && npm run check` → `PASS 83 files 0 violations` (baseline)
- [ ] `grep -r "arch-lint-allow" src/` → `0` (0 whitelist)

## 1) File Structure — Hanya Ini Yang Boleh Berubah

- [ ] **TIDAK** mengubah `src/features/**` (6 features) — `git diff src/features` harus empty
- [ ] **TIDAK** mengubah `src/core/application/viewmodels/**`, `stores/**`, `ui/**` — `git diff src/core/application` hanya `bootstrap.ts` + `adapters` contracts unchanged
- [ ] **TIDAK** mengubah `Dokumen-0*`, `D10`, `D10A` — hanya `src/infrastructure/adapters/*` + `src/core/application/bootstrap.ts` + `tests/adapter-contract/*`
- [ ] Buat `src/infrastructure/adapters/` (jika belum ada):
  - [ ] `RealExecutionAdapter.ts` — `implements ExecutionAdapter` → `D07 ExecutionEngine`
  - [ ] `RealSyncAdapter.ts` — `implements SyncAdapter` → `D07B SyncQueue + SyncTransport`
  - [ ] `RealMemoryAdapter.ts` — `implements MemoryAdapter` → `D05 MemoryRepository`
  - [ ] `RealAndroidAdapter.ts` — `implements AndroidAdapter` → `D06 NativeBridge`
  - [ ] `RealSchedulerAdapter.ts` — `implements SchedulerAdapter` → `D07A Scheduler`

## 2) Adapter Contract Preservation (Stable Boundary)

- [ ] `src/core/application/adapters/*.ts` (interfaces) **TIDAK** diubah — `git diff src/core/application/adapters` empty
- [ ] Setiap `Real*Adapter` `implements` interface yang sama — `Fake` dan `Real` lolos contract test yang sama
- [ ] `Adapter` tidak mengubah semantics authority — tidak memutuskan `RETRY`, `backoff`, atau `permission` — hanya translate `Authority Model ↔ ViewState`

## 3) Per Authority — Real Adapter Details

### D05 Memory — `RealMemoryAdapter`
- [ ] `createMemory` → `MemoryRepository.create` → `D07B enqueue` (bukan adapter yang enqueue langsung — repository impl yang enqueue per D09 §18-20)
- [ ] `searchMemory` → `MemoryRepository.search` + `EmbeddingService` (D05) — adapter hanya map `MemoryEntity → MemoryViewState`
- [ ] Error: `EMBEDDING_FAILED` → `{ messageKey: "memory.embedFailed", retryable: false }`
- [ ] `any` hanya di SDK boundary dengan `// allow-any — InsForge SDK — narrowed via Zod` + narrowing

### D06 Android — `RealAndroidAdapter`
- [ ] `getInstalledApps` → `NativeBridge.getInstalledApps` → `PackageManager` — bukan `ViewModel → Intent`
- [ ] `openApp` → `NativeBridge.openApp` → `Intent` — `ViewModel.onOpenApp → Facade → Service → RealAdapter`
- [ ] Error: `NameNotFoundException` → `android.appNotFound`, `permissionDenied` → `retryable: false`
- [ ] Tidak ada `import { Intent } from "android"` di feature — hanya di `infrastructure/adapters`

### D07 Execution — `RealExecutionAdapter`
- [ ] `execute` → `ExecutionEngine.execute(plan, context)` → map `Execution → ExecutionViewState`
- [ ] `getExecution` → `ExecutionRepository.read(id, userId)` → map
- [ ] `observeExecution` → `ExecutionEngine.onStateChanged` → `InteractionBus.publish(ExecutionStateChanged)` — ordered per `executionId`
- [ ] Error: `PERMISSION_DENIED` → `execution.permissionDenied`, `TIMEOUT` → `retryable: true`

### D07A Scheduler — `RealSchedulerAdapter`
- [ ] `schedule` → `Scheduler.schedule(plan, opts)` → `WorkManager/AlarmManager` via D07A
- [ ] `priority` mapping `CRITICAL → expedited` — adapter translate, bukan decide

### D07B Sync — `RealSyncAdapter` (Paling Kritis)
- [ ] `getSyncStatus` → `SyncQueue.getStatus(userId)` → `SyncViewState` — `OFFLINE` valid, bukan error
- [ ] `observeSync` → `SyncQueue.observeStatus` → `InteractionBus SyncStatusChanged` — at-least-once → `DeduplicationSet` di consumer
- [ ] `requestSync` → `SyncQueue.flush()` — bukan `fetch` langsung
- [ ] `CONFLICT` → `SyncStatus { status: "ATTENTION", conflictCount }`

## 4) DI Replacement — Fake → Real

- [ ] `src/core/application/bootstrap.ts` — satu-satunya tempat `new Real*`:
```ts
if (env === "test") {
  c.registerInstance(TOKENS.SyncAdapter, new FakeSyncAdapter());
} else {
  c.registerInstance(TOKENS.SyncAdapter, new RealSyncAdapter(c.resolve(SyncQueue), c.resolve(SyncTransport)));
}
```
- [ ] `Fake*` tetap ada — tidak dihapus — untuk `test` env dan unit test ViewModel
- [ ] `TOKENS.*Adapter` indirection — `ViewModel → Facade → Service → TOKENS.*Adapter`
- [ ] Tidak ada `new SyncQueue()` / `new Database()` di feature — `arch-lint di-only` harus PASS

## 5) D10A Preservation — Interaction Contracts Tetap

- [ ] `correlationId` (corr_xxx) per `Command` → `Event` propagate — `Real*` tidak invent
- [ ] `eventId` (evt_xxx) dedup — `Store.set` tetap idempotent `eventId` check
- [ ] `timestamp` authority clock — `isStale` tetap — `Real*` tidak override `timestamp`
- [ ] Ordering per-aggregate tetap ordered — `Real*` tidak re-order
- [ ] Lifecycle `mount→dispose` tetap — `Real* observe` return `() => void` → `ViewModel.dispose()` abort+unsubscribe
- [ ] `D10A §30` scenarios pass dengan `Real*`: canonical Tasks→Execution→Sync→Dashboard, duplicate, stale, recovery, offline, race

## 6) ViewModel / Store / UI — Unchanged (Bukti)

- [ ] `git diff src/features --stat` → `0 files changed`
- [ ] `git diff src/core/application/viewmodels src/core/application/stores src/features/*/ui --stat` → `0 files changed`
- [ ] `npm run check` → `arch-lint PASS` dengan file feature identik

## 7) Secrets & Config

- [ ] `INSFORGE_URL`, `INSFORGE_ANON_KEY` hanya di `src/infrastructure/adapters/*` — tidak di `Store/UI` — `grep -r "INSFORGE" src/features` → `0`
- [ ] `.env` tidak di-commit — `bootstrap.ts` baca `import.meta.env`

## 8) Testing

### Contract Tests (BARU — harus pass untuk Fake dan Real)
- [ ] `tests/adapter-contract/execution.contract.test.ts` — same suite, run twice (Fake + Real) — assert `getExecution` shape `ExecutionViewState`
- [ ] `tests/adapter-contract/sync.contract.test.ts` — assert `getSyncStatus` shape `SyncStatus`, `OFFLINE` valid
- [ ] `tests/adapter-contract/memory.contract.test.ts`
- [ ] `tests/adapter-contract/android.contract.test.ts`
- [ ] `tests/adapter-contract/scheduler.contract.test.ts`

### D10A Scenarios (tetap pass)
- [ ] `tests/interaction/canonical.test.ts` — Tasks→Execution→Sync→Dashboard (Fake + Real)
- [ ] `tests/interaction/duplicate.test.ts` — duplicate `eventId` → dedup
- [ ] `tests/interaction/stale.test.ts` — stale event ignored
- [ ] `tests/interaction/recovery.test.ts` — process death `refresh()`
- [ ] `tests/interaction/offline.test.ts` — `OFFLINE` → `executeTask` tetap `LOCAL_SUCCESS`

### Negative (harus tetap FAIL jika dilanggar)
- [ ] `ViewModel → SyncQueue` → `arch-lint FAIL`
- [ ] `UI → SyncService` → `FAIL`
- [ ] `event.payload =` → `FAIL` (D10A §29)

## 9) Gates — CI Must PASS

- [ ] `npm run lint:arch` → `PASS — scanned 83+N files, 0 violations, 0 whitelist`
- [ ] `npm run lint:no-any` → `PASS — 0 violations` (hanya `allow-any` dengan justifikasi di Real adapter)
- [ ] `npm run lint:types` → `PASS — tsc -p tsconfig.application.json` (now includes `src/infrastructure/adapters/**/*.ts`)
- [ ] `npm run check` → `PASS` — `arch-lint` includes `shared: types|events|di|interaction`
- [ ] `grep -r "arch-lint-allow" src/` → `0` — tidak ada whitelist baru
- [ ] `npx tsc --noEmit` (all) — informative, `src/core/execution` legacy errors tidak block `lint:types` (application gate)

## 10) PR Checklist

- [ ] Branch `feat/d11-real-adapters` dari `main` yang sudah `D11 LOCKED`
- [ ] Hanya `src/infrastructure/adapters/*` + `src/core/application/bootstrap.ts` + `tests/adapter-contract/*` yang berubah — `git diff --stat` sesuai §6
- [ ] `README.md` atau `Dokumen-11` tidak diubah di PR ini (hanya implementation)
- [ ] PR description: `Closes D11 — Fake → Real via DI — ViewModel/Store/UI unchanged — D10A preserved`
- [ ] Reviewer checklist: `Adapter Contract unchanged` + `D10A scenarios pass` + `arch-lint PASS 0 whitelist`
- [ ] Setelah PR merge → `npm run check` PASS → tag `v0.11.0-d11`

---

## Quick Commands

```bash
# Before coding
git checkout -b feat/d11-real-adapters
npm run check --silent  # baseline PASS 83 files

# After implementing Real adapters
npm run check           # must PASS 83+N files 0 whitelist
npm test -- tests/adapter-contract  # contract tests Fake + Real
npm test -- tests/interaction       # D10A scenarios

# Prove ViewModel/Store/UI unchanged
git diff src/features --stat        # must be empty
git diff src/core/application/viewmodels src/core/application/stores --stat # empty

# Prove no secrets in feature
grep -r "INSFORGE\|ANON_KEY" src/features && echo "FAIL" || echo "PASS"

# Final
npm run check && echo "✅ Ready for PR"
```

**Invariant:** `D10 defines what features promise. D10A defines how they interact. D11 defines how they connect to reality — without touching what they promised.`
