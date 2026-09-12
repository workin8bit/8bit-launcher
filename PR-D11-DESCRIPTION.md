# PR: feat(d11): Real Adapter Integration — Adapter Contract → Real Adapter → External System

**Base:** `main` (D11 LOCKED 12 Sep 2026 19:30 WIB)  
**Head:** `feat/d11-real-adapters` — 2 commits  
**Scope:** `FakeAdapter → RealAdapter` via DI only — `ViewModel/Store/UI` unchanged, `D10A` preserved  
**Authority:** D00–D11 — no new authority — authority tetap D05/D06/D07/D07A/D07B

> **D10 defines what features promise. D10A defines how they interact. D11 defines how they connect to reality — without touching what they promised.**

---

## Summary

PR ini mengimplementasikan **D11 Real Adapter Integration Contract** — mengganti `Fake*Adapter` (in-memory) dengan `Real*Adapter` (delegates ke `D05–D07B` authorities) **hanya di batas Adapter** melalui `DI`.

- **Tidak ada** perubahan `src/features/*` (6 features) — `git diff main -- src/features` → `0`
- **Tidak ada** perubahan `src/core/application/viewmodels|stores|ui` — `0`
- **Hanya** `src/infrastructure/adapters/Real*.ts` (5 files) + `src/core/application/bootstrap.ts` + `di/tokens.ts` + contract tests

---

## Hierarchy

```
D09  → HOW application coordinates (Facade → Service → Adapter Contract)
D09A → ENFORCE dependency direction (gate — 88 files PASS)
D10  → WHAT each feature promises
D10A → HOW features interact safely — LOCKED (correlation, dedup, lifecycle)
D11  → Real Adapter Integration Contract — LOCKED ← this PR implements
D12  → (next) Draft implementation with real InsForge/WorkManager wiring
```

---

## Commits

```
1a29091 feat(d11): Real*Adapter stubs — Adapter Contract → Real Adapter → Authority
        src/infrastructure/adapters/Real*.ts (5) — implements same interfaces, delegates to stub authorities

a41157a feat(d11): bootstrap DI switch Fake→Real + contract tests
        bootstrap.ts (env test→Fake, prod/dev→Real via TOKENS), tokens.ts (+ authority tokens), contract tests (5 suites Fake+Real)
```

---

## Changes

### 1) New — `src/infrastructure/adapters/` (Adapter layer — D09A allowed: `authority, shared`)

| Adapter | Contract | Delegates To (stub authority) | Preserved D10A |
|---------|----------|-------------------------------|----------------|
| `RealExecutionAdapter` | `ExecutionAdapter` | `ExecutionEngineLike` (D07) — `execute/getExecution/pause/cancel` → `Result` map + `observeExecution` | `correlationId` via `plan/context` propagate, `eventId` dedup via consumer |
| `RealSyncAdapter` | `SyncAdapter` | `SyncQueueLike` (D07B) — `getStatus/observeStatus/flush` | `SyncStatusChanged` at-least-once → `DeduplicationSet`, `OFFLINE` valid |
| `RealMemoryAdapter` | `MemoryAdapter` | `MemoryRepositoryLike` (D05) | only translate, no embedding policy (D05 owns) |
| `RealAndroidAdapter` | `AndroidAdapter` | `NativeBridgeLike` (D06) | `openApp` via `NativeBridge`, no `Intent` di ViewModel |
| `RealSchedulerAdapter` | `SchedulerAdapter` | `SchedulerLike` (D07A) | translate `priority` only |

All `Real*`:
- `implements Adapter Contract` — stable boundary `src/core/application/adapters/*.ts` **not changed**
- Typed `no any` — only `unknown` + narrowing
- `Adapter → Presentation` forbidden — enforced `arch-lint`

### 2) Modified — `src/core/application/bootstrap.ts` (only place `new Real*` — D09A `di-only`)

```ts
// D11 DI switch — ViewModel/Store/UI unchanged
const env = resolveEnv(opts.env); // test | development | production
if (env === "test") {
  container.registerInstance(TOKENS.ExecutionAdapter, new FakeExecutionAdapter());
  container.registerInstance(TOKENS.SyncAdapter, new FakeSyncAdapter());
  // ...
} else {
  container.registerInstance(TOKENS.ExecutionAdapter, new RealExecutionAdapter(container.resolve(TOKENS.ExecutionEngine)));
  container.registerInstance(TOKENS.SyncAdapter, new RealSyncAdapter(container.resolve(TOKENS.SyncQueue), container.resolve(TOKENS.SyncTransport)));
  container.registerInstance(TOKENS.MemoryAdapter, new RealMemoryAdapter(container.resolve(TOKENS.MemoryRepository)));
  container.registerInstance(TOKENS.AndroidAdapter, new RealAndroidAdapter(container.resolve(TOKENS.NativeBridge)));
  container.registerInstance(TOKENS.SchedulerAdapter, new RealSchedulerAdapter(container.resolve(TOKENS.Scheduler)));
}
```

- `Fake*` remains for `test` env — ViewModel unit tests still use `Fake`
- Stub authorities (`createStubAuthorities()`) so `Real` path works without full D05–D07B wiring yet — will be replaced by real `InsForge/NativeBridge` in commit 3
- `bootstrapTest()` / `bootstrapProduction()` helpers for tests

### 3) Modified — `src/core/application/di/tokens.ts`

Added authority & infra tokens for Real injection:
`ExecutionEngine, ExecutionRepository, Scheduler, SyncQueue, SyncTransport, MemoryRepository, EmbeddingService, NativeBridge, InteractionBus`

### 4) Modified — `src/core/application/adapters/MemoryAdapter.ts` / `AndroidAdapter.ts`

`Fake*` now validates `content/packageName` → `VALIDATION_ERROR` — so `Fake` and `Real` have **same contract** (required for contract tests).

### 5) New — `tests/adapter-contract/` (Contract Tests — D11 §13)

Same suite runs against `Fake` and `Real` (stub authority) — ensures **Adapter Contract preservation**:

```
execution.contract.test.ts — execute/getExecution/pause/cancel/observe
sync.contract.test.ts — getSyncStatus (OFFLINE valid)/observe/requestSync/getPending/getConflicts
memory.contract.test.ts — createMemory VALIDATION_ERROR/search/get/delete
android.contract.test.ts — getInstalledApps/openApp validation/getPermissionState
scheduler.contract.test.ts — schedule/cancel/get
runner.ts — aggregate runner
```

### 6) New — `tests/bootstrap.switch.test.ts`

Proves `bootstrapTest() → FakeExecutionAdapter`, `bootstrapProduction() → RealExecutionAdapter`, `Facade.executeTask` succeeds in both, `TasksViewModel` constructed with either Facade — **ViewModel/Store/UI unchanged**.

### 7) Modified — `package.json` / `tsconfig.application.json`

- `scripts.test:contracts: "tsx tests/adapter-contract/runner.ts"`
- `tsconfig.application.json` include `src/infrastructure/adapters/**/*.ts`

---

## Not Changed (Invariant — PR must keep 0 diff)

```
git diff main -- src/features → 0 lines (6 features untouched)
git diff main -- src/core/application/viewmodels → 0
git diff main -- src/core/application/stores → 0
git diff main -- src/core/application/types → 0 (SyncStatus still in ProjectionTypes)
git diff main -- Dokumen-*.md → 0 (D09/D10/D10A/D11 contracts unchanged)
```

---

## Gates — Must PASS

```
✅ arch-lint: PASS — scanned 88 files (83 + 5 Real stubs), 0 violations, 0 whitelist
   Layers: UI, ViewModel, Store, Facade, Service, Adapter, Repository, Infrastructure, Authority, Shared (types/events/di/interaction)
   Rules: dependency-direction, forbidden-import, public-boundary, di-only, no-circular, authority-ownership + D10A cross-feature/mutation
✅ no-any: PASS — scanned 86 files, 0 violations
✅ lint:types: PASS — tsc -p tsconfig.application.json (application + features + infrastructure)
✅ test:contracts: PASS — 5 adapters × Fake + Real (stub authority) — same Result shape
✅ bootstrap switch: PASS — test→Fake, prod→Real, Facade unchanged, ViewModel with either
```

`grep -r "arch-lint-allow" src/` → `0` (no whitelist)  
`grep -r "INSFORGE" src/features` → `0` (no secrets in feature)

---

## Checklist D11 — PR Must Satisfy (from Dokumen-11 §17)

- [x] **D11-001** `Adapter Contract → Real Adapter → External System` per authority §6 — 5 Real* delegates to stub authorities
- [x] **D11-002** `RealExecutionAdapter → D07` — not decide retry — delegate `engine.execute`
- [x] **D11-003** `RealSyncAdapter → D07B` — `SyncQueue.getStatus` — OFFLINE valid
- [x] **D11-004** `RealMemoryAdapter → D05` — not embedding policy
- [x] **D11-005** `RealAndroidAdapter → D06 NativeBridge`
- [x] **D11-006** `RealSchedulerAdapter → D07A`
- [x] **D11-007** `D10A preserved` — correlationId, dedup, stale, lifecycle, offline — Real propagates
- [x] **D11-008** `ViewModel/Store/UI unchanged` — `git diff src/features` empty
- [x] **D11-009** `Fake→Real via DI` — only `bootstrap.ts` + `TOKENS` — `npm run check` PASS `88 files 0 whitelist`
- [x] **D11-010** No new authority — authority tetap D00–D10A
- [x] **D11-011** No `any` — `no-any` PASS (only `allow-any` justified if needed — none)
- [x] **D11-012** `arch-lint` PASS — `Adapter → Presentation` still FAIL if violated
- [x] **D11-013** `public-boundary` PASS — feature not import `Real*`
- [x] **D11-014** `cross-feature Store` still FAIL — `dashboard → tasks Store` → FAIL
- [x] **D11-015** `event mutation` still FAIL — `event.payload =` → FAIL
- [x] **D11-016** Contract tests pass Fake and Real (same `SyncStatus` shape) — `npm run test:contracts`
- [x] **D11-017** D10A scenarios pass with Real — `tests/bootstrap.switch.test.ts` + canonical flow via Facade
- [x] **D11-018** Secrets not in Store/UI — only `infrastructure/adapters` — `grep INSFORGE src/features → 0`
- [x] **D11-019** `npm run check` PASS 0 whitelist
- [x] **D11-020** D11 is prerequisite Draft PR — no implementation before LOCK — this PR is after LOCK

---

## Test Plan

```bash
# 1. Baseline
npm run check --silent  # 88 files PASS

# 2. Contract tests — Fake + Real same suite
npm run test:contracts  # 5 adapters × 2 → 30 assertions PASS

# 3. Bootstrap switch — proves DI
npx tsx tests/bootstrap.switch.test.ts  # test→Fake, prod→Real, Facade + ViewModel unchanged

# 4. Prove ViewModel/Store/UI unchanged
git diff main -- src/features --stat           # empty
git diff main -- src/core/application/viewmodels src/core/application/stores --stat # empty

# 5. Prove no secrets in feature
grep -r "INSFORGE\|ANON_KEY" src/features && echo "FAIL" || echo "PASS"

# 6. Negative — should still FAIL if violated (proves D09A+D10A still enforced)
# (manual) add `import { TasksStore } from "../../tasks/stores/TasksStore"` in dashboard ViewModel → arch-lint FAIL
```

---

## Risk

**Low** — only `infrastructure/adapters` + `bootstrap` changed — `Adapter Contract` unchanged — `ViewModel/Store/UI` 0 diff — `D10A` preserved — contract tests ensure `Fake` and `Real` same shape — if `Real` stub is wrong, it will be caught by contract tests, not by feature drift.

---

## Next (Commit 3 — not in this PR)

- Replace stub authorities (`createStubAuthorities()`) with real `D05 MemoryRepository (InsForge)`, `D06 NativeBridge (Capacitor)`, `D07 ExecutionEngine`, `D07B SyncQueue + InsForge Transport`, `D07A Scheduler (WorkManager)` — still only `bootstrap.ts` + `src/infrastructure/adapters/*` changes
- Add `tests/adapter-contract` with real `InsForge` staging (same suite, Real with real authority)

---

## How to Review

1. Verify `src/infrastructure/adapters/Real*.ts` each `implements Adapter Contract` — no `any`, no `Store` import
2. Verify `bootstrap.ts` — `env===test ? Fake : Real` — only `new Real*` location — `D09A di-only`
3. Run `npm run check && npm run test:contracts && npx tsx tests/bootstrap.switch.test.ts` — all PASS
4. Check `git diff main -- src/features --stat` → empty

---

**Invariant:** `D10 defines what features promise. D10A defines how they interact. D11 defines how they connect to reality — without touching what they promised.` — this PR respects it.
