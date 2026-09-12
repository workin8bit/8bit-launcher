# D07A — 8bitAI Execution Scheduler Specification
> **Document ID:** D07A
> **Document Type:** Implementation Contract
> **Status:** LOCKED / AUTHORITATIVE WITHIN SCHEDULER LAYER — Version 1.0
> **Project:** 8bitAI
> **Depends On:** D00, D01, D02, D03, D04, D05, D06, D07
> **Primary Responsibility:** Deterministic scheduling, queuing, concurrency, and lifecycle orchestration of Executions — without becoming execution authority
> **Date:** 2026-09-12 — Kudus, ID
> **Authority:** D00 → D01 → D02 → D03 → D04 → D05 → D06 → D07 → D07A

---

## 1. Document Purpose
D07A mendefinisikan **ExecutionScheduler** sebagai lapisan yang mengatur **kapan** sebuah Execution dijalankan, bukan **bagaimana** ia dieksekusi.

Scheduler bertanggung jawab terhadap:
- menerima execution request dari Agent Core;
- melakukan admission & validation ringan (bukan plan validation D07);
- enqueue ke durable queue;
- menentukan urutan eksekusi (priority + FIFO + dependency readiness);
- menegakkan concurrency limit;
- mengalokasikan execution slot (foreground/background);
- menjadwalkan retry dengan backoff;
- menangani pause/resume/cancel;
- menangani lifecycle Android (foreground/background/process death);
- mencegah starvation & retry storm;
- mencatat observability & audit untuk scheduling.

D07A **tidak mengambil alih** authority D07 Execution Engine. Validasi plan, permission gate, tool execution, verification, recovery decision, journal/audit tetap di D07.

## 2. Authority Hierarchy
```
D00 Master Constitution
  ↓
D01 Product Vision
  ↓
D02 System & Agent Architecture
  ↓
D03 Tool System
  ↓
D04 Agent Core & Planner (WHAT)
  ↓
D05 Memory System
  ↓
D06 Android Integration (WHERE)
  ↓
D07 Execution Engine (HOW safely — authority)
  ↓
D07A Execution Scheduler (WHEN — orchestrator, NOT authority)
```
Jika konflik: Higher Authority > Lower. Scheduler MUST NOT meng-override keputusan D07 (permission, verification, recovery). Jika Scheduler menerima instruksi yang bertentangan dengan D07: `STOP → DENY → AUDIT → REPORT`.

## 3. Core Principle
«Scheduler decides WHEN execution runs. Engine decides HOW it is safely executed.»

| Layer | Decides | MUST NOT |
|-------|---------|----------|
| **D07 Engine** | Plan validation, execution state, permission, tool execution, verification, recovery, result, journal/audit | — |
| **D07A Scheduler** | Enqueue, dequeue, priority, concurrency, pause/resume/cancel timing, backoff, foreground/background slot | Memvalidasi plan, mengubah permission, mengeksekusi tool, memverifikasi result, memutuskan recovery |

Scheduler adalah **orchestrator**, bukan authority. Ia tidak pernah memanggil Tool atau NativeBridge.

## 4. Canonical Position

```
                 ┌──────────────────────┐
                 │      Agent Core      │
                 │ D04 Planner / Agent  │
                 └──────────┬───────────┘
                            │ Structured Plan
                            ▼
                 ┌──────────────────────┐
                 │  ExecutionScheduler  │  ← D07A (WHEN)
                 │  Queue + Policy +    │
                 │  Concurrency + Retry │
                 └──────────┬───────────┘
                            │ Dequeue (WHEN ready)
                            ▼
                 ┌──────────────────────┐
                 │    ExecutionEngine   │  ← D07 (HOW)
                 │  StateMachine + Gate │
                 │  StepExecutor + Verify│
                 │  Recovery + Journal  │
                 └──────────┬───────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    Permission         StepExecutor       Recovery
       Gate                                  │
          │                                  │
          └──────────────┬───────────────────┘
                         ▼
                  Tool / Android (D03/D06)
                         │
                         ▼
                 ┌────────────────┐
                 │   SyncQueue    │  ← D07B (next)
                 │  Durable Queue │
                 └───────┬────────┘
                         │
                    online? → InsForge / Local
```

Scheduler berada **di atas** Engine, bukan di dalam Engine. Engine tidak tahu tentang queue depth atau priority — Engine hanya tahu `start(execution)` saat dipanggil Scheduler.

## 5. Execution Unit Model

Scheduler mengelola **ScheduledExecution** — wrapper di atas D07 Execution:

```typescript
interface ScheduledExecution {
  executionId: string;        // same as D07 Execution
  planId: string;
  priority: ExecutionPriority; // D07A decides ordering
  enqueueAt: string;
  scheduledAt?: string;
  startedAt?: string;
  state: SchedulerState;      // D07A state, orthogonal to D07 ExecutionState
  attempt: number;
  nextRetryAt?: string;       // for backoff
  concurrencyGroup?: string;  // for resource lock
  lifecycle: "foreground" | "background" | "deferred";
  cancellationRequested: boolean;
}

type ExecutionPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | "DEFERRED";
type SchedulerState =
  | "QUEUED"
  | "SCHEDULED"
  | "RUNNING"        // handed to Engine
  | "WAITING"        // WAITING_USER / NETWORK / LIFECYCLE (mirrors Engine)
  | "RETRY_DELAY"    // backoff waiting
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
```

`SchedulerState` **berbeda** dari `ExecutionState` (D07 §10). SchedulerState melacak **posisi di queue**, ExecutionState melacak **lifecycle di Engine**. Keduanya konsisten via events, tetapi tidak saling menggantikan.

## 6. Responsibilities

Scheduler **MUST**:

1. Menerima `schedule(plan, context, priority?)` dari Agent Core;
2. Melakukan admission check ringan (queue not full, not duplicate executionId);
3. Enqueue ke durable queue **sebelum** memanggil Engine (crash-safe);
4. Menentukan ordering: `priority DESC → enqueueAt ASC` (FIFO within priority) + starvation prevention;
5. Menegakkan concurrency limit (maxConcurrentExecutions);
6. Mengalokasikan slot sesuai lifecycle (foreground/background);
7. Dequeue dan memanggil `ExecutionEngine.start()` saat slot tersedia;
8. Menangani `WAITING_*` dari Engine — memindahkan ke WAITING queue, bukan RUNNING;
9. Menjadwalkan retry dengan backoff (dari RecoveryManager decision);
10. Mendukung `pause/resume/cancel` (cooperative);
11. Menangani process death — reload durable queue & resume;
12. Mencegah starvation & retry storm (bounded);
13. Mencatat scheduler observability & audit.

## 7. Non-Responsibilities

Scheduler **MUST NOT**:

- Memvalidasi Structured Plan (itu D07 §16 PlanValidator);
- Mengevaluasi permission (itu D07 §28 PermissionGate);
- Memanggil Tool atau NativeBridge (itu D07 §25 StepExecutor → D03/D06);
- Memverifikasi result (itu D07 §22 VerificationManager);
- Memutuskan recovery strategy (itu D07 §40 RecoveryManager — Scheduler hanya menjadwalkan retry timing);
- Menulis User Knowledge atau Memory (itu D05);
- Menganggap network selalu tersedia;
- Menganggap process selalu hidup;
- Membuat capability baru.

## 8. Queue Model

### 8.1 Logical Queues

```
                 ┌─────────────┐
  schedule() ──→ │  QUEUED     │ ← durable, priority-ordered
                 └──────┬──────┘
                        │ dequeue (when slot available + dependencies met)
                        ▼
                 ┌─────────────┐
                 │  SCHEDULED  │ ← ready to run, waiting for slot
                 └──────┬──────┘
                        │ dispatch
                        ▼
                 ┌─────────────┐
                 │   RUNNING   │ ← handed to Engine (maxConcurrent)
                 └──────┬──────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
     ┌─────────┐  ┌─────────┐  ┌──────────┐
     │ WAITING │  │RETRY_DELAY│ │  PAUSED  │
     └────┬────┘  └────┬─────┘  └────┬─────┘
          │            │             │
          └────────────┴─────────────┘
                       │ resume / retryAt reached / cancel
                       ▼
                 ┌─────────────┐
                 │  COMPLETED / FAILED / CANCELLED (terminal)
                 └─────────────┘
```

Durable state harus memungkinkan **reconstruction queue setelah restart** (D07 §54).

### 8.2 Durable Queue Contract

```typescript
interface SchedulerQueue {
  enqueue(item: ScheduledExecution): Promise<void>;
  dequeue(): Promise<ScheduledExecution | null>; // respects priority + concurrency
  peek(): Promise<ScheduledExecution | null>;
  remove(executionId: string): Promise<void>;
  update(item: ScheduledExecution): Promise<void>;
  list(state?: SchedulerState): Promise<ScheduledExecution[]>;
  count(state?: SchedulerState): Promise<number>;
}
```

Queue MUST be durable (survive process death) — backed by `ExecutionRepository` or separate `SchedulerRepository` using same durable storage as D05 Local Repository.

## 9. Scheduling Policy

### 9.1 Priority

| Priority | Use | Example |
|----------|-----|---------|
| `CRITICAL` | System recovery, user-initiated urgent | Process-death recovery, user `cancel` |
| `HIGH` | User waiting (foreground) | Interactive chat task |
| `NORMAL` | Default | Regular agent task |
| `LOW` | Background deferrable | Memory consolidation |
| `DEFERRED` | Explicitly deferred | Scheduled automation |

Ordering: `CRITICAL > HIGH > NORMAL > LOW > DEFERRED`, then `enqueueAt ASC` (FIFO within priority).

### 9.2 Concurrency Limit

```typescript
interface ConcurrencyPolicy {
  maxConcurrent: number; // MVP: 1-2, default 1 (sequential)
  maxConcurrentPerGroup?: Record<string, number>; // e.g., "file:default" → 1
}
```

Default execution mode **SEQUENTIAL** (D07 §66) — parallel only if steps independent, no conflicting resource, policy allows. Scheduler enforces `maxConcurrent` by not dequeuing beyond limit.

### 9.3 Starvation Prevention

Pure priority queue dapat starve LOW. Scheduler MUST implement **aging**: setiap `30s` di QUEUED, effective priority naik 1 level (max HIGH). Atau: after 3 HIGH dequeued, force 1 NORMAL if exists.

### 9.4 Resource Lock

Side-effecting operations pada resource sama membutuhkan serialization (D07 §68):

```typescript
interface ResourceLock { resource: string; holderId: string; expiresAt: string; }
```

Ex: `file.write:/home/user/notes.md` — Scheduler tidak dequeue execution yang butuh resource yang sedang di-lock, hingga lock dilepas atau timeout.

## 10. Persistence & Durability

Scheduler state **harus persistent sebelum dispatch kritis** (mirip D07 §50):

Minimum durable per ScheduledExecution: `executionId, planId, priority, enqueueAt, scheduledAt, state, attempt, nextRetryAt, concurrencyGroup, lifecycle, cancellationRequested, queuePosition`

```typescript
interface SchedulerRepository {
  save(item: ScheduledExecution): Promise<void>;
  get(executionId: string): Promise<ScheduledExecution | null>;
  listAll(): Promise<ScheduledExecution[]>;
  update(item: ScheduledExecution): Promise<void>;
  remove(executionId: string): Promise<void>;
}
```

Implementation: **reuse** `ExecutionRepository` durable storage (InsForge Local DB) — tidak membuat DB baru yang tidak sinkron.

## 11. Process Death & Recovery

D07A MUST assume process death ANY TIME (D07 §54). Recovery:

```
PROCESS DEATH → APP RESTART → LOAD durable queue → LOAD durable executions (D07)
→ RECONSTRUCT: QUEUED/SCHEDULED/RETRY_DELAY/WAITING
→ For RUNNING: check Engine state — if Engine says COMPLETED/FAILED, move to terminal; if IN_FLIGHT/UNKNOWN, delegate to Engine Recovery
→ Resume dequeue loop
```

Scheduler **tidak** memulihkan execution logic — hanya memulihkan **queue position**. Recovery decision tetap di Engine (D07 §55-56).

## 12. Cancellation

Cooperative, sama seperti D07 §34, tetapi di level queue:

- `QUEUED` → remove from queue → CANCELLED
- `SCHEDULED` → remove → CANCELLED
- `RUNNING` → forward `cancel()` to Engine → wait for Engine to reach CANCELLED → then Scheduler marks CANCELLED
- `RETRY_DELAY/WAITING` → cancel pending timer → CANCELLED

User cancellation **MUST** take precedence over retry (D07 §72). No new retry after CANCELLED.

## 13. Retry Scheduling (Backoff Timing)

Scheduler **tidak memutuskan apakah retry**, hanya **kapan** retry (timing). Decision `RETRY` datang dari `RecoveryManager` (D07 §40).

```typescript
interface RetrySchedule {
  nextRetryAt: string;
  attempt: number;
  backoffMs: number;
}

function computeBackoff(attempt: number, policy: RetryPolicy): number {
  // D07 §35: NONE/LINEAR/EXPONENTIAL
  // Cap at 60s for Scheduler to avoid starvation
}
```

Flow: `Engine → RecoveryManager → RETRY(safe=true, retryDelayMs) → Scheduler.enqueueRetry(executionId, nextRetryAt)` → Scheduler moves to `RETRY_DELAY` queue → timer fires → dequeue when `now >= nextRetryAt` and slot available.

**Batching MUST NOT weaken permission**: retry still goes through Engine's PermissionGate re-check.

## 14. Foreground / Background Execution (Android Lifecycle D06)

Scheduler MUST respect Android lifecycle (D06 §25-27, D07 §58-59):

| Lifecycle | Scheduler Action |
|-----------|------------------|
| `APP_FOREGROUND` | Dequeue HIGH/NORMAL, allow 1 concurrent |
| `APP_BACKGROUND` | Only CRITICAL or background-allowed tasks; others → PAUSED or RETRY_DELAY |
| `PROCESS_RESTART` | Reload durable queue (see §11) |
| `NETWORK_AVAILABLE` | Resume WAITING_NETWORK |
| `NETWORK_LOST` | Move RUNNING network-dependent to WAITING_NETWORK |

Long-running → via `WorkManager-like` (D06 §27) — Scheduler marks as `lifecycle: background` and defers to system scheduler.

## 15. Observability & Audit

Scheduler MUST expose (without secrets):

- `scheduler_queue_depth{state}` — count per SchedulerState
- `scheduler_dequeue_latency`
- `scheduler_concurrency_utilization`
- `scheduler_retry_scheduled_total`
- `scheduler_cancellation_total`
- `scheduler_process_death_recoveries`

Journal events (append to same ExecutionJournal D07 §46):

`SCHEDULED, ENQUEUED, DEQUEUED, PAUSED, RESUMED, RETRY_SCHEDULED, CANCELLED_BY_SCHEDULER`

Audit: scheduling decision `who scheduled what priority, why` — but not plan content secrets.

## 16. Security & Isolation

- Scheduler MUST NOT expose `ExecutionContext` secrets in queue metadata.
- Cross-user isolation (D05 §6.1): `user-A` queue MUST NOT be visible to `user-B` — queue keyed by `userId`.
- No bypass: `UI → Scheduler → Engine` is canonical; `UI → Engine` direct MUST be blocked in production (only allowed in tests).
- Resource lock MUST NOT allow priority inversion to bypass permission.

## 17. Interfaces

```typescript
interface IExecutionScheduler {
  /** Agent Core calls this — enqueue durable, then return executionId */
  schedule(plan: StructuredPlan, context: ExecutionContext, opts?: { priority?: ExecutionPriority; lifecycle?: "foreground"|"background"|"deferred"; concurrencyGroup?: string }): Promise<string>;

  /** Scheduler internal loop — dequeue when slot available */
  dequeue(): Promise<ScheduledExecution | null>;

  pause(executionId: string): Promise<void>;
  resume(executionId: string): Promise<void>;
  cancel(executionId: string): Promise<void>;

  /** Called by Engine after RecoveryManager decides RETRY */
  scheduleRetry(executionId: string, delayMs: number): Promise<void>;

  /** Lifecycle hooks from D06 */
  onLifecycle(event: "APP_FOREGROUND"|"APP_BACKGROUND"|"PROCESS_RESTART"|"NETWORK_AVAILABLE"|"NETWORK_LOST"): Promise<void>;

  /** Durable recovery after restart */
  recover(): Promise<void>;

  /** Observability */
  getStatus(): Promise<{ queued: number; running: number; retryDelay: number; paused: number }>;
}

interface SchedulerDependencies {
  queue: SchedulerQueue;
  repository: SchedulerRepository;
  engine: IExecutionEngine; // D07
  clock: { now: () => string };
  concurrencyPolicy: ConcurrencyPolicy;
}
```

## 18. Testing & Acceptance

### Unit Tests

- Enqueue → durable → dequeue respects priority + FIFO
- Concurrency limit: maxConcurrent=1 → second dequeue blocks until first completes
- Starvation: LOW eventually promoted via aging
- Resource lock: file.write same resource serializes
- Retry backoff: attempt 0→1s, 1→3s, 2→9s

### Integration Tests

- `schedule()` → Engine.start() called when slot available
- `cancel(QUEUED)` removes from queue, never calls Engine
- `cancel(RUNNING)` forwards to Engine and waits
- Process death: enqueue 2, kill, restart → recover() reloads 2

### Acceptance Matrix

| ID | Test | Expected |
|----|------|----------|
| SCHED-001 | Single execution | QUEUED → SCHEDULED → RUNNING → COMPLETED |
| SCHED-002 | Two executions, maxConcurrent=1 | Second waits until first completes |
| SCHED-003 | HIGH vs NORMAL | HIGH dequeued first regardless of enqueue time |
| SCHED-004 | Priority aging | LOW after 90s behaves as HIGH |
| SCHED-005 | Resource lock | Same file resource serializes |
| SCHED-006 | Cancel QUEUED | Removed, never executed |
| SCHED-007 | Cancel RUNNING | Forwarded to Engine, ends CANCELLED |
| SCHED-008 | Retry backoff | RETRY_DELAY → dequeued after delayMs |
| SCHED-009 | Process death | Durable queue survives, recover() restores |
| SCHED-010 | Background lifecycle | APP_BACKGROUND pauses NORMAL, allows CRITICAL |
| SCHED-011 | Starvation prevention | LOW not starved by continuous HIGH |
| SCHED-012 | Queue overflow | Backpressure: REJECT or WAIT, not unbounded enqueue (D07 §122) |

## 19. Implementation Priority

**Phase 1 — Core Queue:**
- SchedulerQueue (durable, priority-ordered)
- ConcurrencyPolicy (maxConcurrent=1)
- Dequeue loop

**Phase 2 — Lifecycle & Retry:**
- RETRY_DELAY with timer
- WAITING states mirroring Engine
- Cancellation (QUEUED/SCHEDULED/RUNNING)

**Phase 3 — Advanced:**
- Resource lock
- Starvation aging
- Foreground/background lifecycle
- Process-death recovery

## 20. Dependency Rules

```
Agent Core → Scheduler → Engine → Tool → Android
             (WHEN)      (HOW)
```

Scheduler MAY depend on: Engine, Queue, Clock, ConcurrencyPolicy
Scheduler MUST NOT depend on: LLM, Planner, Tool internals, MemoryRepository, NativeBridge

## 21. Anti-Drift Rules

Future MUST NOT:

1. Let Scheduler validate plans (that's Engine);
2. Let Scheduler call Tool/NativeBridge;
3. Let Scheduler decide recovery strategy (that's RecoveryManager);
4. Let Scheduler write Memory directly;
5. Add hidden priority bypass;
6. Introduce unbounded queue;
7. Treat process death as impossible;
8. Weaken fail-closed.

If needed: `STOP → REPORT → UPDATE D07 FIRST`.

## 22. Final Contract

D07A establishes:

«Scheduler decides WHEN execution runs, Engine decides HOW it is safely executed.»

D07A is **orchestrator**, not authority. All safety, permission, verification, and recovery authority remain in D07.

> END OF D07A — EXECUTION SCHEDULER SPECIFICATION
> Next: D07B — Offline SyncQueue & Synchronization Specification

