# Dokumen 09A — Architecture Lint & Dependency Enforcement Specification

| Field | Value |
|-------|-------|
| **Kode** | D09A |
| **Judul** | Architecture Lint & Dependency Enforcement Specification |
| **Versi** | 1.0 — READY FOR LOCK |
| **Tanggal** | 12 September 2026 |
| **Parent** | D09 Frontend Application Contract (D00 → D09) |
| **Depends On** | D00 Master Constitution, D02 Architecture, D03 Tool System, D04 Agent Core, D05 Memory, D06 Android Integration, D07 Execution Engine, D07A Scheduler, D07B SyncQueue, D08 UI Control Surface, D08A UI State & Interaction, D09 Frontend Application Contract |
| **Enforces** | D00 Ch.4 Dependency Rule, D09 §4, §27, §66-68, §71-72, §77, §105, §146-147, §240-241 |
| **Sifat** | **Enforcement Specification — bukan architectural authority baru** |
| **Status** | READY FOR LOCK — gate PASS (76 files, 0 violations) |

> **Prinsip:** D09A tidak memiliki architectural authority di atas D00–D09. Ia **hanya menegakkan** kontrak yang sudah ditetapkan. `Frontend coordinates. Authorities decide. D09A enforces.` — Jika D09A bertentangan dengan D00–D09, D00–D09 menang.

---

## 1. Tujuan

D09 baru saja membuktikan boundary `Application → Feature` (24 file feature + 29 file application, `npm run check` PASS). Sebelum masuk `D10 Feature Contracts` dan `Real Adapter Integration`, boundary tersebut harus **dikunci secara otomatis** agar penambahan feature tidak membuat drift diam-diam.

D09A menetapkan:

1. Canonical dependency direction yang tidak boleh dilanggar.
2. Definisi layer yang dapat di-lint.
3. Matrix yang mengikat.
4. Daftar forbidden imports.
5. Aturan public boundary, DI-only, circular, authority ownership, no-any, barrel.
6. CI gate dan semantics pelanggaran.
7. Prosedur verifikasi dan kebijakan whitelist.

Tujuannya bukan menambah arsitektur, melainkan **membuat pelanggaran arsitektur menjadi build failure**.

## 2. Kedudukan dalam Hierarki

```
D00 Constitution (WHY — FINAL)
 └─ D09 Frontend Application Contract (WHERE — HOW APPLICATION COORDINATES)
     └─ D09A Architecture Lint & Dependency Enforcement (ENFORCEMENT — no new authority)
         └─ Feature Modules Scaffolding (6 features × ui/viewmodels/stores — PASS)
             └─ D10 Feature Contracts (NEXT — formal Input/Output/ViewState/Events/Commands per feature)
                 └─ Real Adapter Integration (D05/D06/D07/D07A/D07B — via DI)
```

- **Subordinate:** D09A tunduk pada D00–D09. D09A tidak boleh menciptakan `Store → Authority` baru, tidak boleh mengubah `Facade → Service → Adapter` chain, tidak boleh mendefinisikan `SyncQueue` atau `ExecutionEngine`.
- **Enforcement Only:** D09A adalah **static-check specification**. Authority tetap `D03–D07B` untuk domain logic, `D09` untuk orchestration.
- **Conflict Rule:** Jika aturan lint bertentangan dengan D00–D09, D00–D09 menang dan D09A harus direvisi.

## 3. Canonical Dependency Direction

Satu-satunya arah yang diizinkan:

```
UI (features/*/ui, app/*)
  ↓  Event → Command
ViewModel (core/application/viewmodels, features/*/viewmodels)
  ↓  Command / Query
Store (core/application/stores, features/*/stores)  ── presentation state only
  ↕  (ViewModel reads/writes Store; UI reads ViewState type from Store is type-only allowed)
Facade (core/application/facade) — stable boundary, orchestration only
  ↓  delegates
Service (core/application/services, features/*/services)
  ↓  via Adapter
Adapter (core/application/adapters, infrastructure/adapters)
  ↓  calls
Repository (core/application/repositories — interface, infrastructure/repositories — impl)
  ↓
Infrastructure (infrastructure/*)
  ↓
Authority (core/execution, core/scheduler, core/sync, core/memory, core/android, core/tool) — D03–D07B

Shared (core/application/types, core/application/events, core/application/di) — order -1, importable everywhere
```

**One-way:** `Authority → Adapter → Service → Facade → ViewModel → UI` untuk data, `UI → ViewModel → Facade → Service → Adapter → Authority` untuk commands. Tidak ada panah terbalik.

## 4. Layer Definitions

| Layer | Label | Path Pattern (regex) | Order | Deskripsi |
|-------|-------|----------------------|-------|-----------|
| `ui` | UI | `src/(features/[^/]+/ui|features/[^/]+/presentation|ui|presentation|app)/` | 0 | Dumb surface, props + pure map, no side effects |
| `viewmodel` | ViewModel | `src/(core/application/viewmodels|features/[^/]+/viewmodels)/` | 1 | Domain/Application → Presentation, Event → Command |
| `store` | Store | `src/(core/application/stores|features/[^/]+/stores)/` | 2 | Presentation state only, not source of truth |
| `facade` | Facade | `src/core/application/facade/` | 3 | Stable boundary, orchestration only |
| `service` | Service | `src/(core/application/services|features/[^/]+/services)/` | 4 | Delegation + translation, no authority |
| `adapter` | Adapter | `src/(core/application/adapters|infrastructure/adapters)/` | 5 | Translate, no semantics change |
| `repository` | Repository | `src/(core/application/repositories|infrastructure/repositories)/` | 6 | Interface (app) vs impl (infra) |
| `infrastructure` | Infrastructure | `src/infrastructure/` | 7 | DB, network, Android SDK wrapper |
| `authority` | Authority | `src/core/(execution|scheduler|sync|memory|android|tool)/` | 8 | D03–D07B — owns its state |
| `shared` | Shared | `src/core/application/(types|events|di)/` | -1 | Types, events, DI tokens — neutral |

*Implementasi:* `tools/arch-lint/config.mjs` → `LAYERS`. File yang tidak match (mis. `docs/`, `scripts/`) dianggap neutral dan tidak di-lint untuk direction.

## 5. Allowed Dependency Matrix

`ALLOWED_IMPORTS[from][to] === true` → diizinkan. `shared` selalu diizinkan (`order -1`).

| From \ To | viewmodel | store | facade | service | adapter | repository | infrastructure | authority | shared |
|-----------|-----------|-------|--------|---------|---------|------------|----------------|-----------|--------|
| **ui** | ✅ | ✅* | ✅ | — | — | — | — | — | ✅ |
| **viewmodel** | — | ✅ | ✅ | — | — | — | — | — | ✅ |
| **store** | — | — | — | — | — | — | — | — | ✅ |
| **facade** | — | — | — | ✅ | — | — | — | — | ✅ |
| **service** | — | — | — | — | ✅ | ✅ | — | — | ✅ |
| **adapter** | — | — | — | — | — | ✅ | ✅ | ✅ | ✅ |
| **repository** | — | — | — | — | — | — | ✅ | — | ✅ |
| **infrastructure** | — | — | — | — | — | — | — | — | ✅ |
| **authority** | — | — | — | — | — | — | — | — | ✅ |

`*` `ui → store` **hanya untuk type-only** `ViewState` (mis. `TasksViewState` dari `stores/TasksStore`). Runtime access `store` tetap via `ViewModel`. Linter saat ini tidak membedakan type-only vs value, sehingga `ui → store` diizinkan di matrix dan dijelaskan di §14.

**Violation:** `Facade → Adapter` (walau sekadar type `SyncStatus`) adalah **FAIL** — type dipindah ke `ProjectionTypes` (shared) agar `Facade` tetap `→ shared`.

## 6. Forbidden Imports

Selain matrix, regex per-layer menangkap pelanggaran spesifik (D09 §13, §34, §105):

| From | Forbidden Substring (regex) | Pesan |
|------|-----------------------------|-------|
| `ui` | `src/infrastructure`, `/repositories`, `src/core/(execution|scheduler|sync|memory|android)` | UI → infrastructure/repositories/authority FORBIDDEN |
| `ui` | `src/core/application/adapters` | UI → Adapter FORBIDDEN |
| `ui` | `src/core/application/services` | UI → Service FORBIDDEN |
| `viewmodel` | `/repositories`, `src/infrastructure` | ViewModel → repositories/infrastructure FORBIDDEN |
| `viewmodel` | `SyncQueue|SyncAdapter.*direct|src/core/sync` | ViewModel → SyncQueue (D07B) FORBIDDEN |
| `viewmodel` | `AndroidAdapter|src/core/android` | ViewModel → Android authority FORBIDDEN |
| `viewmodel` | `src/core/application/adapters` | ViewModel → Adapter FORBIDDEN |
| `store` | `src/core/application/(adapters|services|facade|repositories)` atau `src/core/(execution|sync|memory|android)` | Store → Service/Adapter/Authority FORBIDDEN — Store is not source of truth |
| `service` | `src/core/execution/(ExecutionEngine|StepExecutor|ExecutionStateMachine|PermissionGate)` | Service → Engine internals FORBIDDEN |
| `service` | `src/core/sync/.*SyncQueue`, `src/core/memory/.*Repository` | Service → SyncQueue/Memory internals FORBIDDEN |
| `service` | `src/(features|core/application/viewmodels|core/application/stores|presentation|ui)` | Service → Presentation FORBIDDEN |
| `adapter` | `src/core/application/(viewmodels|stores|facade)` atau `src/features/.*/(viewmodels|stores|ui)` | Adapter → Presentation FORBIDDEN |
| `repository` | `src/infrastructure` | Repository interface → infrastructure impl FORBIDDEN |

## 7. Feature Public Boundary

Feature `src/features/*` **hanya boleh** import boundary publik:

**Allowed entry points:**
- `src/core/application/index.ts` (barrel)
- `src/core/application/facade/ApplicationFacade.ts`
- `src/core/application/bootstrap.ts`
- `src/core/application/di/Container.ts` dan `tokens.ts`

**Internals yang tidak boleh diimport langsung oleh feature:**
- `src/core/application/services/**`
- `src/core/application/adapters/**`
- `src/core/application/stores/**`

*Correct:* `features/tasks/viewmodels` → `facade/ApplicationFacade`
*Wrong:* `features/tasks/ui` → `services/ExecutionService` → **FAIL** (`public-boundary`)

Barrel `src/core/application/index.ts` adalah boundary stabil — `D09 §71-72`.

## 8. DI-Only Enforcement

`new Database()`, `new SyncQueue()`, `new ExecutionEngine`, `new *Service()`, `new *Adapter()` di luar lokasi yang diizinkan adalah **FAIL**.

**Allowed `new` locations:**
- `src/core/application/di/**`
- `src/core/application/bootstrap.ts`
- `tools/**`, `__tests__/**`, `*.test.ts`, `*.spec.ts`

**Forbidden patterns:**
- `new (ExecutionService|SchedulerService|SyncService|MemoryService|AndroidService)(`
- `new (ExecutionAdapter|SchedulerAdapter|SyncAdapter|MemoryAdapter|AndroidAdapter)(`
- `new Database(`
- `new SyncQueue(`
- `new ExecutionEngine(`

*Alasan:* D09 §27 — semua dependency via `Container.resolve()`, tidak ada hard-coded singleton di feature/viewmodel.

## 9. Circular Dependency Detection

- **Deteksi:** DFS pada graph `src/**/*.ts` → `import`/`require`/`export from`.
- **Cross-layer only:** Siklus dalam layer yang sama atau prefix direktori yang sama **diabaikan** (mis. `src/core/execution/types/ExecutionTypes.ts ↔ ExecutionStep.ts` adalah type-only mutual dan intentional).
- **Kriteria FAIL:** Siklus yang melibatkan ≥2 layer berbeda **atau** ≥2 prefix `src/core/*` berbeda.
- *Pesan:* `Circular dependency detected: a → b → a (D09 §27 — circular imports break DI)`

## 10. Authority Ownership Enforcement

Feature/application tidak boleh **re-implementasi** authority:

| Pattern | Allowed Path | Pesan |
|---------|--------------|-------|
| `class\s+ExecutionEngine\b` | `src/core/execution/` | Reimplementing ExecutionEngine outside src/core/execution is FORBIDDEN (D07) |
| `class\s+SyncQueue\b` | `src/core/sync/` | Reimplementing SyncQueue outside src/core/sync is FORBIDDEN (D07B) |
| `class\s+Scheduler\b` | `src/core/scheduler/` | Reimplementing Scheduler outside src/core/scheduler is FORBIDDEN (D07A) |

*Catatan:* Regex menggunakan `\b` agar `SchedulerService` tidak false-positive.

## 11. No-Any Enforcement

- **Aturan:** `noImplicitAny: true`, `@typescript-eslint/no-explicit-any: error`, plus scanner `tools/arch-lint/check-no-any.mjs`.
- **Mendeteksi:** `: any`, `as any`, `<any>`, `Array<any>`, `any[]` di `src/**/*.ts`.
- **Escape hatch:** Baris mengandung `allow-any` diberi pengecualian (harus dijustifikasi untuk transport boundary).
- **Fix:** Gunakan `unknown` + narrowing atau `Result<T,E>` / `ApplicationError` (D09 §77, §146).

## 12. Feature Barrel Rules

Setiap feature `src/features/<name>/index.ts` **hanya boleh** export:

- `ViewModel` (`features/*/viewmodels/*`)
- `Store` (`features/*/stores/*`)
- UI contract (`features/*/ui/*` — props, map helpers, renderer type)

**Dilarang export:** `Service`, `Adapter`, `Repository`, `Infrastructure`.

*Alasan:* Feature adalah **projection surface**, bukan authority.

## 13. CI Enforcement

**Scripts (`package.json`):**
```json
"lint:arch": "node tools/arch-lint/lint.mjs",
"lint:arch:verbose": "node tools/arch-lint/lint.mjs --verbose",
"lint:no-any": "node tools/arch-lint/check-no-any.mjs",
"lint:types": "tsc --noEmit -p tsconfig.application.json",
"check": "npm run lint:arch && npm run lint:no-any && npm run lint:types"
```

**CI (` .github/workflows/arch-lint.yml`):**
- Trigger: `push` / `pull_request` ke `main` / `develop`
- Steps: `setup-node → npm ci → lint:arch → lint:no-any → lint:types` — **FAIL blocks PR**.

**Gate untuk D10:** `D10 Feature Contracts` tidak boleh dimulai jika `check` != 0.

## 14. Violation Semantics

| Severity | Rule | Exit | CI | Pesan |
|----------|------|------|----|-------|
| **FAIL (build blocker)** | `dependency-direction`, `forbidden-import`, `public-boundary`, `di-only`, `no-circular` (cross-layer), `authority-ownership`, `no-any` | `1` | ❌ Block PR | `❌ arch-lint: FAIL — N violation(s)` + file:line + import + hint |
| **PASS** | 0 violations | `0` | ✅ Allow | `✅ arch-lint: PASS — scanned N files, 0 violations` |
| **Verbose** | — | — | — | `--verbose` menambahkan daftar file |

**Hint default:** `Fix: follow canonical chain UI → ViewModel → Facade → Service → Adapter → Authority (D09 §4, §66-68)`

## 15. False-Positive / Whitelist Policy

D09A bukan untuk menghasilkan false-positive yang memblokir produktivitas. Kebijakan:

1. **Type-only `ui → store` diperbolehkan** untuk `ViewState` shape. Jika linter di masa depan membedakan `import type`, aturan dapat diperketat kembali.
2. **Authority internal cycles** diabaikan (satu prefix).
3. **Whitelist harus eksplisit per file** dengan komentar `// arch-lint-allow: <rule> — reason: <D09 § reference> — expires: <date>` — tidak ada global ignore.
4. Perubahan whitelist harus di-review dan dicatat di `tools/arch-lint/README.md`.
5. Saat ini **0 whitelist** — 76 files PASS tanpa pengecualian.

## 16. Verification Procedure

```bash
# 1. Baseline
npm run check
# ✅ arch-lint: PASS — scanned 76 files
# ✅ no-any: PASS — scanned 74 files
# ✅ lint:types: PASS

# 2. Negative test — ViewModel → Authority (harus FAIL)
echo 'import { ExecutionEngine } from "../../../core/execution/ExecutionEngine"; export class V{ e=new ExecutionEngine(); }' > src/features/tasks/viewmodels/_Violation.ts
node tools/arch-lint/lint.mjs  # ❌ FAIL — dependency-direction + di-only
rm src/features/tasks/viewmodels/_Violation.ts

# 3. Negative test — UI → Repository (harus FAIL)
echo 'import { IRepository } from "../../../core/application/repositories/IRepository";' > src/features/memory/ui/_Violation.ts
node tools/arch-lint/lint.mjs  # ❌ FAIL — forbidden-import
rm src/features/memory/ui/_Violation.ts

# 4. Negative test — any (harus FAIL)
echo 'export const bad = null as any;' > src/features/dashboard/stores/_Bad.ts
node tools/arch-lint/check-no-any.mjs  # ❌ FAIL
rm src/features/dashboard/stores/_Bad.ts

# 5. Re-verify
npm run check  # ✅ PASS — siap D10
```

*Hasil aktual 12 Sep 2026:* Semua negative test tertangkap, setelah cleanup kembali PASS.

## 17. Drift Policy

- **Tujuan:** Mencegah `feature modules` diam-diam menjadi authority atau mengakses `SyncQueue`/`ExecutionEngine` secara langsung — kegagalan yang sulit di-debug di runtime integration.
- **Deteksi:** Static check, bukan runtime. Drift terdeteksi sebelum `Real Adapter Integration` (D05–D07B).
- **Respon:** Build FAIL, PR blocked, fix di layer yang salah (mis. pindahkan logic dari `ViewModel` ke `Service → Adapter`).
- **Evolusi:** Jika matrix perlu dilonggarkan (mis. feature memerlukan `services/` sendiri), D09A direvisi **terlebih dahulu** dan di-LOCK, baru scaffolding diperbarui — tidak ada `// @ts-ignore` diam-diam.

## 18. Enforcement Scope vs Architectural Authority

| Aspek | D09 (Authority) | D09A (Enforcement) |
|-------|-----------------|---------------------|
| **Mendefinisikan** | `Facade`, `Service`, `Adapter`, `Store`, `ViewModel` responsibilities, orchestration | Aturan lint yang memastikan `Facade` tidak menjadi God Object |
| **Menciptakan** | Contracts (`Command`, `Query`, `ViewState`) | Tidak menciptakan contract baru — hanya memeriksa import |
| **Mengubah** | Boleh mengubah `D10` feature contracts | Tidak boleh mengubah `D00–D09` — jika lint bertentangan, `D00–D09` menang |
| **Gagal** | Perubahan D09 memerlukan re-LOCK D09 + D09A | Pelanggaran D09A memperbaiki kode, bukan mengubah D09 |

## 19. Relation to Feature Scaffolding

Scaffolding `src/features/{dashboard,tasks,execution,memory,sync,android}` (24 file) adalah **bukti pertama** D09A:

- Dibuat setelah `D09` + `D09A config` — bukan sebelumnya.
- Setiap feature mematuhi `ui → viewmodels → ApplicationFacade` tanpa `repository/service/adapter` langsung.
- `npm run check` PASS membuktikan boundary cukup matang untuk menjadi enforcement layer sebelum `D10`.

## 20. Relation to D10

Setelah `D09A LOCK`, `D10 Feature Contracts` akan mendefinisikan untuk keenam feature:

```
Feature Contract
├── Input
├── Output
├── ViewState
├── Events
├── Commands
├── ViewModel responsibilities
├── Store responsibilities
├── UI responsibilities
├── ApplicationFacade dependency
├── Error mapping (ApplicationError → messageKey)
├── Loading state (Store.isLoading)
├── Empty state
└── Lifecycle (startObserving → refresh → dispose)
```

`D10` tetap **projection contracts**, bukan authority. `D09A` tetap gate — jika `D10` melanggar `ui → viewmodels → Facade`, `D09A` akan FAIL.

Urutan yang dikunci (sesuai keputusan user):

```
D09  Frontend Application Contract               — LOCKED boundary
 └─ D09A Architecture Lint & Dependency Enforcement — LOCK NOW (this document)
     └─ Feature Modules Scaffolding              — PASS (76 files)
         └─ D10  Feature Contracts               — NEXT
             └─ D10A Feature Interaction / State Contracts
                 └─ Real Adapter Integration (D05/D06/D07/D07A/D07B)
```

## 21. Implementation

**Files:**

```
tools/arch-lint/
├── config.mjs          — single source of truth (LAYERS, ALLOWED_IMPORTS, FORBIDDEN_IMPORT_PATTERNS, PUBLIC_BOUNDARY, DI_ONLY, AUTHORITY_OWNERSHIP)
├── lint.mjs            — scanner (src/**/*.ts) + 6 rules + cross-layer cycle detection
├── check-no-any.mjs    — no-any scanner (src/**/*.ts, escape hatch: allow-any)
└── README.md           — canonical chain, examples, verify steps

package.json             — lint:arch, lint:arch:verbose, lint:no-any, lint:types, check
tsconfig.json            — baseUrl, paths @/*, strict
tsconfig.application.json — include: src/core/application/**/*.ts + src/features/**/*.ts
.github/workflows/arch-lint.yml — CI gate
```

**Perbaikan yang sudah di-LOCK untuk PASS:**

1. `SyncStatus` + `AndroidAppInfo` dipindah ke `types/ProjectionTypes.ts` (shared) — `Facade → Adapter` tidak lagi diperlukan.
2. Regex `class\s+Scheduler` → `class\s+Scheduler\b` agar `SchedulerService` tidak false-positive.
3. `ui → store` ditambahkan ke `ALLOWED_IMPORTS` untuk ViewState type-only (didokumentasikan §5).
4. Cycle detection mengabaikan siklus satu-prefix (authority internal).

## 22. Testing

- **Unit negative tests:** Temporary files `_Violation*.ts` dengan import terlarang → `lint.mjs` harus `FAIL` dengan rule yang tepat.
- **Integration:** `npm run check` menjalankan 3 gate berurutan — fail di gate mana pun menghentikan pipeline.
- **Regression:** Setelah fix, `check` harus `PASS` tanpa menambah whitelist.

*Hasil 12 Sep 2026:* `dependency-direction`, `forbidden-import`, `di-only`, `no-any` semuanya tertangkap; setelah cleanup kembali PASS.

## 23. Acceptance — D09A-001 s/d D09A-020

| ID | Kriteria | Status |
|----|----------|--------|
| **D09A-001** | Canonical direction `UI → ViewModel → Facade → Service → Adapter → Authority` terdokumentasi dan dienforce | ✅ PASS — `lint.mjs` §3 |
| **D09A-002** | Layer definitions (ui, viewmodel, store, facade, service, adapter, repository, infrastructure, authority, shared) terdefinisi dengan path regex | ✅ PASS — `config.mjs` LAYERS |
| **D09A-003** | Allowed dependency matrix dienforce — `Facade → Adapter` adalah FAIL | ✅ PASS — verified via `Facade` fix |
| **D09A-004** | Forbidden imports untuk `ui`, `viewmodel`, `store`, `service`, `adapter`, `repository` terdokumentasi dan dienforce | ✅ PASS — `FORBIDDEN_IMPORT_PATTERNS` |
| **D09A-005** | `ViewModel → Repository/Infrastructure/SyncQueue/Android` dienforce | ✅ PASS — `forbidden-import` tests |
| **D09A-006** | Feature public boundary dienforce — feature hanya boleh `ApplicationFacade` barrel | ✅ PASS — `PUBLIC_BOUNDARY` |
| **D09A-007** | DI-only enforcement — `new Database()/SyncQueue()/ExecutionEngine/*Service/*Adapter` di luar `di/` adalah FAIL | ✅ PASS — `DI_ONLY` |
| **D09A-008** | Circular detection untuk cross-layer cycles, mengabaikan authority internal cycles | ✅ PASS — `isCrossLayerCycle` |
| **D09A-009** | Authority ownership — reimplementasi `ExecutionEngine/SyncQueue/Scheduler` di luar authority adalah FAIL | ✅ PASS — `AUTHORITY_OWNERSHIP` + `\\b` fix |
| **D09A-010** | No-any enforcement — `: any`, `as any`, `<any>` adalah FAIL | ✅ PASS — `check-no-any.mjs` |
| **D09A-011** | Feature barrel rules — `features/*/index.ts` hanya export ViewModel/Store/UI | ✅ PASS — scaffolding review |
| **D09A-012** | CI enforcement — `lint:arch + lint:no-any + lint:types` di PR | ✅ PASS — `arch-lint.yml` |
| **D09A-013** | Violation semantics — FAIL = exit 1 + file:import + hint | ✅ PASS — `lint.mjs` report |
| **D09A-014** | False-positive policy — type-only `ui → store` diizinkan, whitelist eksplisit per file | ✅ PASS — §15, 0 whitelist |
| **D09A-015** | Verification procedure terdokumentasi dan dapat direproduksi | ✅ PASS — §16 |
| **D09A-016** | Drift policy — drift terdeteksi static sebelum Real Adapter Integration | ✅ PASS — §17 |
| **D09A-017** | D09A tidak memiliki authority di atas D00–D09 — conflict rule terdokumentasi | ✅ PASS — §2, §18 |
| **D09A-018** | Feature scaffolding (24 file, 6 features) PASS tanpa whitelist | ✅ PASS — 76 files PASS |
| **D09A-019** | Implementasi `tools/arch-lint/*`, `package.json`, `tsconfig.*`, CI terdokumentasi | ✅ PASS — §21 |
| **D09A-020** | D09A adalah prasyarat untuk `D10 Feature Contracts` — gate terdokumentasi | ✅ PASS — §20, `check` != 0 blocks D10 |

---

**Status Dokumen:** READY FOR LOCK — menunggu persetujuan user. Setelah LOCK, `D09A` menjadi **authoritative enforcement specification** untuk semua `src/**`. `D10 Feature Contracts` baru dapat dimulai setelah `D09A LOCK`.

**Invariant:** `D00 specifies why. D09 specifies where. D09A enforces how. Features do not decide. Authorities do.`
