# D07B — 8bitAI Offline SyncQueue & Synchronization Specification
> **Document ID:** D07B
> **Document Type:** Implementation Contract
> **Status:** LOCKED / AUTHORITATIVE WITHIN SYNC LAYER — Version 1.0
> **Project:** 8bitAI
> **Depends On:** D00, D01, D02, D03, D04, D05, D06, D07, D07A
> **Primary Responsibility:** Durable, idempotent, ordered, retry-safe synchronization between local durable storage and InsForge — without becoming execution or memory authority
> **Date:** 2026-09-12 — Kudus, ID
> **Authority:** D00 → D01 → D02 → D03 → D04 → D05 → D06 → D07 → D07A → D07B

---

## 1. Scope & Non-Goals

### 1.1 Scope
D07B mengatur **sinkronisasi** data/command yang dihasilkan **setelah** Execution (D07) dan **sebelum** InsForge Remote. Data yang disinkronkan: `ExecutionEvent/Journal, Audit, Memory mutations (D05), Task state` — bukan eksekusi itu sendiri.

D07B memastikan:
- Local-first / offline-first operasional saat offline;
- Queue durable survive process death/restart;
- Idempotency mencegah duplicate mutation;
- Ordering eksplisit per entity/aggregate;
- Retry + exponential backoff + jitter;
- Network-aware dispatch tanpa mengambil alih lifecycle D07A;
- Conflict detection & resolution eksplisit;
- Journal/Audit tidak hilang saat sync gagal;
- SyncTransport sebagai boundary ke InsForge.

### 1.2 Non-Goals
D07B **BUKAN**:
- Execution Scheduler (itu D07A — memutuskan WHEN execution dijalankan);
- Execution Engine (itu D07 — memutuskan HOW safely);
- Memory System (itu D05 — memutuskan WHAT is storable/promotable);
- Permission Authority (itu D03/D06 — D07B hanya re-check);
- Network policy maker (itu D07A lifecycle — D07B hanya network-aware dispatch);
- UI layer.

## 2. Architectural Position

```
D00 Constitution
  ↓
D01 Product Vision
  ↓
D02 System & Agent Architecture
  ↓
D03 Tool System
  ↓
D04 Agent Core (WHAT)
  ↓
D05 Memory System (MemoryService/MemoryRepository)
  ↓
D06 Android Integration (WHERE — NativeBridge)
  ↓
D07 Execution Engine (HOW — validation/permission/verify/recover)
  ↓
D07A Execution Scheduler (WHEN — queue/concurrency/retry timing)
  ↓
👉 D07B Offline SyncQueue & Synchronization (PERSISTENCE BOUNDARY)
  ↓
D08 UI / Control Surface (consumes stable contracts)
```

**Canonical Data Flow:**
```
Execution (D07) → ExecutionEvent/Journal → SyncQueue (D07B Local Durable)
Memory Mutation (D05) → SyncQueue (D07B)
                                    ↓
                              SyncTransport (abstraction)
                                    ↓
                                InsForge Remote
                                    ↓
                              Conflict Resolver
                                    ↓
                              Local Reconciliation
```

Scheduler berada **di atas** Engine, SyncQueue berada **setelah** Engine sebagai **persistence/synchronization boundary**. Scheduler → Engine → SyncQueue adalah urutan, bukan alternatif.

## 3. Authority Boundary

| Layer | Authority | D07B MUST NOT |
|-------|-----------|---------------|
| **D07 Engine** | Plan validation, permission, verification, recovery, journal | — |
| **D07A Scheduler** | WHEN execution runs, concurrency, retry timing, lifecycle | — |
| **D07B SyncQueue** | Durable queue, idempotency, ordering, retry with backoff, network-aware dispatch, conflict detection, transport | Memutuskan apakah execution boleh dijalankan, memvalidasi plan, memanggil Tool, menulis User Knowledge langsung, membuat permission baru |

**Forbidden paths:**
```
Execution → Remote InsForge (bypass SyncQueue) → FORBIDDEN
SyncQueue → MemoryRepository direct write (bypass MemoryService/Policy) → FORBIDDEN
SyncQueue → Permission creation → FORBIDDEN
LLM → SyncQueue → FORBIDDEN
UI → SyncTransport direct → FORBIDDEN
```

SyncQueue hanya meneruskan **apa yang sudah diotorisasi** oleh D07/D05.

## 4. Sync Model

**Local-first / Offline-first:**

```
Agent/MemoryService produces mutation
          ↓
Local Repository (durable, immediate success for user)
          ↓
SyncQueue enqueue (durable, idempotent)
          ↓
SyncTransport dispatch (when online, network-available)
          ↓
InsForge Remote (idempotent receiver)
          ↓
Ack → dequeue + mark synced
Nack/Conflict → Conflict Resolution → Reconciliation
```

- Saat **offline**: `Local success = User-visible success`. SyncQueue menahan item sebagai `PENDING`. Agent tetap beroperasi via Local Repository (D05 §46, D06 §23).
- Saat **online**: SyncTransport drain queue sesuai ordering & idempotency.
- **Eventual consistency**: Local dan Remote konvergen ketika network kembali, dengan conflict policy eksplisit.

## 5. Data Flow (Detailed)

```
1. Execution completes → Engine appends Journal (D07 §46)
         ↓
2. Engine/MemoryService → SyncQueue.enqueue({ idempotencyKey, entityId, operation, payload })
         ↓ (atomic with local commit where possible)
3. Local Repository commit succeeds → user sees success
         ↓
4. SyncQueue state = PENDING
         ↓
5. Scheduler/NetworkMonitor signals NETWORK_AVAILABLE → SyncQueue dispatcher wakes
         ↓
6. SyncQueue → SyncTransport.sendBatch(items) (ordered, idempotent)
         ↓
7. InsForge → validates idempotencyKey → applies or returns ALREADY_APPLIED
         ↓
8. Transport → Ack → SyncQueue marks SYNCED + removes from durable queue
         ↓ (on conflict)
9. InsForge → CONFLICT → SyncQueue → ConflictResolver → local reconciliation → re-enqueue if needed
```

**Journal/Audit path:**
```
Journal append → Local durable → SyncQueue (as separate items with same idempotencyKey)
Even if sync fails, local Journal/Audit NEVER lost (D07 §50 Durable Execution State).
```

## 6. SyncQueue State Machine

```
                    ┌──────────┐
              enqueue│ PENDING  │←── local commit
                    └────┬─────┘
                         │ dispatch (online + slot available)
                         ▼
                    ┌──────────┐
                    │ SENDING  │──→ network call via SyncTransport
                    └────┬─────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      ┌────────┐   ┌─────────┐   ┌──────────┐
      │ SYNCED │   │ FAILED  │   │ CONFLICT │
      └───┬────┘   └────┬────┘   └────┬─────┘
          │             │             │
          ▼             ▼             ▼
       (remove)    ┌─────────┐   ┌──────────┐
                   │ RETRYING│   │RESOLVING │
                   └────┬────┘   └────┬─────┘
                        │             │
                        └──────┬──────┘
                               │ success/resolved
                               ▼
                          ┌──────────┐
                          │ PENDING  │ (re-enqueue with new attempt)
                          └──────────┘

Terminal: SYNCED (removed), FAILED (after max retries, requires manual intervention)
Non-terminal: PENDING, SENDING, RETRYING, CONFLICT/RESOLVING
```

Transitions MUST be durable (persist before dispatch).

## 7. Queue Item Contract

```typescript
interface SyncQueueItem {
  /** Globally unique, stable across retries — primary idempotency key */
  idempotencyKey: string; // e.g., `${entityId}:${operation}:${version}` or executionId:journalId
  /** Entity being synced */
  entityId: string;       // executionId, memoryId, journalEntryId
  entityType: "execution" | "journal" | "audit" | "memory" | "task";
  operation: SyncOperation;
  /** Monotonic per-entity, for ordering & conflict detection */
  version: number;
  /** For aggregate ordering — e.g., executionId or memoryId */
  aggregateId: string;
  /** Payload hash for deduplication */
  payloadHash: string;
  /** Actual payload — MUST NOT contain secrets (redacted) */
  payload: unknown;
  /** D05 AccessContext for permission re-check before remote apply */
  accessContext: { userId: string; sessionId?: string };
  /** Queue metadata */
  state: "PENDING" | "SENDING" | "SYNCED" | "FAILED" | "RETRYING" | "CONFLICT";
  attempt: number;
  nextRetryAt?: string;
  lastError?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  updatedAt: string;
  /** For dependency ordering */
  dependsOn?: string[]; // idempotencyKeys that must sync before this
}
```

**Invariants:**
- `idempotencyKey` MUST be deterministic and unique per logical mutation.
- `version` MUST be monotonic per `aggregateId`.
- `payload` MUST be sanitized (no password/token/privateKey).

## 8. Sync Operation Types

| Operation | Idempotent | Ordering Key | Notes |
|-----------|------------|--------------|-------|
| `UPSERT` (memory, execution) | Yes (via idempotencyKey + version) | `aggregateId` | Last-write-wins with conflict detection |
| `DELETE` (logical) | Yes | `aggregateId` | Tombstone, not physical delete |
| `APPEND` (journal, audit) | Yes | `aggregateId + sequence` | Append-only, never update |
| `ARCHIVE` | Yes | `aggregateId` | State transition, versioned |

`APPEND` items (journal/audit) MUST be ordered by `sequenceNumber` within `aggregateId` and never reordered.

## 9. Idempotency Contract

**Receiver (InsForge) MUST be idempotent:**

```
SyncTransport.send(item) → InsForge receives { idempotencyKey, version, payload }
  If idempotencyKey already applied → return ALREADY_APPLIED (success, not error)
  Else if version <= currentVersion → CONFLICT (stale)
  Else → apply + store idempotencyKey
```

**Sender (SyncQueue) MUST:**
- Generate stable `idempotencyKey` per logical mutation (not per network attempt).
- Retry with **same** `idempotencyKey` — never generate new one for same mutation.
- On `ALREADY_APPLIED` → treat as `SYNCED` (remove from queue).

**Storage:** InsForge maintains `idempotencyKeys` table with TTL (e.g., 7 days) — sufficient for retry window.

## 10. Ordering & Dependency

**Per-aggregate ordering:**

- All items with same `aggregateId` MUST be dispatched in `version ASC` order.
- Items with `dependsOn` MUST NOT be dispatched until dependencies are `SYNCED`.

**Example:**
```
execution:exec_123:journal:001 (version 1) → must sync before
execution:exec_123:journal:002 (version 2) → must sync before
memory:mem_456:upsert:3 (version 3, dependsOn journal:002)
```

**Implementation:** Dispatcher groups by `aggregateId`, sorts by `version`, checks `dependsOn` satisfaction before sending batch.

**Cross-aggregate:** No global ordering required — batches may contain multiple aggregates, but per-aggregate order preserved.

## 11. Retry & Backoff

**Retry only if `retryable=true` (from SyncTransport error classification).**

```typescript
interface RetryPolicy {
  maxAttempts: number; // default 5 for SyncQueue (vs 2 for Engine)
  baseMs: number;      // 1000
  maxMs: number;       // 60000
  jitter: boolean;     // true — add 0-30% random
}
```

Backoff: `delay = min(base * 2^attempt + jitter, maxMs)`

| Error | Retryable | Action |
|-------|-----------|--------|
| `NETWORK_UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED` | true | RETRY with backoff |
| `CONFLICT` | false (needs resolution) | → ConflictResolver |
| `PERMISSION_DENIED`, `VALIDATION_ERROR`, `SECURITY_VIOLATION` | false | → FAILED (no retry) — requires manual/policy fix |
| `UNKNOWN` | false | → FAILED + audit |

**Bounded:** Max 5 attempts, then `FAILED` terminal — requires user/system intervention, not infinite storm (D07 §121 Circuit Breaker analogy).

## 12. Network State Handling

SyncQueue is **network-aware** but **not** lifecycle authority:

- Listens to `NETWORK_AVAILABLE / NETWORK_LOST` from D06 NetworkAdapter (via D07A lifecycle events).
- On `NETWORK_LOST`: move `SENDING` → `PENDING`, pause dispatcher, keep queue durable.
- On `NETWORK_AVAILABLE`: trigger `drain()` — re-evaluate `RETRY_DELAY` (if `nextRetryAt <= now`) and `PENDING`.
- Network check is **before** dispatch, not after failure — avoids wasted attempts.

**Offline mutation semantics (§21):** `Local commit → success` regardless of network. Sync is **eventual**, not blocking.

## 13. Conflict Detection

**Detection at InsForge (source of truth for version):**

```
Local version = 3, Remote currentVersion = 2 → OK (local newer)
Local version = 2, Remote currentVersion = 3 → CONFLICT (stale)
Local version = 3, Remote currentVersion = 3 but payloadHash differs → CONFLICT (concurrent)
```

InsForge returns:

```typescript
interface SyncConflict {
  idempotencyKey: string;
  aggregateId: string;
  localVersion: number;
  remoteVersion: number;
  remotePayloadHash?: string;
  conflictType: "STALE" | "CONCURRENT";
}
```

## 14. Conflict Resolution

**Explicit policy — no silent last-write-wins for critical data:**

| Conflict Type | Policy | Action |
|---------------|--------|--------|
| `STALE` (local older) | `REMOTE_WINS` | Discard local, refresh from remote, mark SYNCED |
| `CONCURRENT` (same version, different hash) | Configurable per entityType | `execution/journal`: REMOTE_WINS (journal is append-only, shouldn't conflict) — log anomaly<br>`memory`: `MERGE` if possible, else `REMOTE_WINS` + create conflict audit + optionally `ASK_USER` |
| `memory` with `user_knowledge` | `REMOTE_WINS` + audit — never auto-promote conflicting to User Knowledge | Requires D05 MemoryPolicy re-evaluation |

**Resolver contract:**

```typescript
interface ConflictResolver {
  resolve(conflict: SyncConflict, localItem: SyncQueueItem, remoteRecord: unknown): Promise<"REMOTE_WINS" | "LOCAL_WINS" | "MERGE" | "ASK_USER">;
}
```

Resolution result → reconciliation: either `SYNCED` (discard local) or re-enqueue new item with incremented version (for MERGE/LOCAL_WINS).

**All conflicts generate AuditEvent** (D07 §47).

## 15. InsForge SyncTransport

**Abstraction boundary to InsForge:**

```typescript
interface SyncTransport {
  /** Send single item (idempotent) */
  send(item: SyncQueueItem): Promise<SyncTransportResult>;
  /** Send batch — per-aggregate ordered, atomic per item (not atomic batch) */
  sendBatch(items: SyncQueueItem[]): Promise<BatchSyncResult>;
  /** Fetch remote version for conflict check (optional) */
  fetchVersion?(aggregateId: string): Promise<{ version: number; payloadHash: string } | null>;
}

interface SyncTransportResult {
  status: "SYNCED" | "ALREADY_APPLIED" | "CONFLICT" | "FAILED";
  conflict?: SyncConflict;
  error?: { code: string; message: string; retryable: boolean };
}

interface BatchSyncResult {
  results: Array<{ idempotencyKey: string; result: SyncTransportResult }>;
}
```

**Implementation:** HTTP to InsForge (authenticated via D06 Secure Storage session token, not in payload). Transport MUST handle `401 → re-auth → retry once`, `429 → backoff`.

**Batch:** Single-item semantics per item — one item failure does not rollback others. Each item's idempotency独立.

## 16. Local Repository Boundary

**SyncQueue MUST NOT directly access MemoryRepository or ExecutionRepository tables** beyond its own queue table.

```
Allowed:
SyncQueue → SyncQueueRepository (own table: sync_queue_items)
SyncQueue → SyncTransport → InsForge

Forbidden:
SyncQueue → MemoryRepository direct write
SyncQueue → ExecutionRepository direct write
SyncQueue → UserKnowledgeRepository
```

Local mutations go **through** their authoritative services (D05 MemoryService, D07 ExecutionRepository) **before** being enqueued. SyncQueue only **observes** via enqueue calls, not via direct DB triggers.

## 17. Journal/Audit Guarantees

- Every `ExecutionJournalEntry` (D07 §47) and `AuditEvent` (D07 §48) that is durable locally **MUST** be enqueued for sync (as `APPEND` with `aggregateId=executionId`).
- Journal/Audit sync failure **MUST NOT** delete local journal — local remains source of truth until synced.
- SyncQueue MUST prioritize journal/audit `APPEND` in order — if journal:001 fails, journal:002 MUST NOT sync before 001 (ordering §10).
- Even if sync permanently `FAILED`, local journal **MUST NOT be lost** — requires manual export/retry.

## 18. Process Death & Recovery

MUST survive `process death ANY TIME` (D07 §54):

```
PROCESS DEATH → APP RESTART → LOAD SyncQueue durable (all PENDING/SENDING/RETRYING/CONFLICT)
→ For SENDING: mark as PENDING (unknown outcome — re-check idempotency on next send)
→ For RETRYING: keep nextRetryAt, re-schedule timer
→ For PENDING: ready to drain
→ Trigger drain if network available
```

**Crash Safety & Atomicity (§19):**

- `Local commit + enqueue` SHOULD be transactional where possible (same DB transaction). If not possible: `enqueue first, then commit, then mark enqueue as valid` — or use outbox pattern: write to local table + outbox in same transaction, background poll outbox to enqueue.
- `SENDING → SYNCED` transition + `remove from queue` MUST be atomic with ack persistence — to avoid duplicate on crash after ack but before removal, rely on idempotencyKey on next retry (receiver returns ALREADY_APPLIED).

## 19. Crash Safety & Atomicity (Detailed)

**Outbox Pattern (recommended):**

```
BEGIN TX
  INSERT INTO memory (local)
  INSERT INTO sync_outbox (idempotencyKey, payloadHash, state=PENDING)
COMMIT

Background: poll sync_outbox → enqueue to SyncQueue → dispatch
```

This ensures local commit and sync intent are atomic.

**SENDING atomicity:**

```
UPDATE sync_queue_items SET state=SENDING WHERE idempotencyKey=X
→ SyncTransport.send(X)
→ On Ack: DELETE FROM sync_queue_items WHERE idempotencyKey=X  (atomic)
→ On crash between send and delete: next restart finds SENDING → revert to PENDING → resend with same idempotencyKey → ALREADY_APPLIED → delete (safe)
```

## 20. Authentication & Permission Re-check

**Authentication:** SyncTransport uses session token from D06 Secure Storage — **not** stored in SyncQueueItem payload. On `401 UNAUTHORIZED`: pause queue, trigger re-auth via D06 Auth layer, then retry once. Do not store token in journal.

**Permission Re-check:** Before `send()`, SyncQueue SHOULD re-check `accessContext` still valid (user not logged out, permission not revoked). If `PERMISSION_DENIED` → `FAILED` (not retryable) — do not send to InsForge only to be rejected.

**D03/D06 remains authoritative** — D07B does not create new permission.

## 21. Deduplication

**Before enqueue:** Check `idempotencyKey` already in queue (PENDING/SENDING/RETRYING) → deduplicate (ignore duplicate enqueue). Check `payloadHash` + `version` for same `aggregateId` → if identical, skip.

**Before send:** Dispatcher deduplicates batch by `idempotencyKey` (keep latest).

**At receiver:** Deduplicate via idempotencyKeys table (§9).

## 22. Backpressure

If queue size exceeds threshold (e.g., 1000 items or 10MB):

- `enqueue()` returns `QUEUE_FULL` — caller (Engine/MemoryService) SHOULD handle: for critical journal, **must** still enqueue (journal never dropped); for non-critical, may `RETRY_LATER`.
- Dispatcher applies `maxBatchSize` (e.g., 20) and `maxConcurrentBatches` (1 for MVP) to avoid overwhelming InsForge.
- Never `unbounded enqueue` (D07 §122).

## 23. Batch / Single-item Synchronization

- **Single-item:** For `APPEND` journal — must preserve order, so batch in order but each item individually acked.
- **Batch:** For `UPSERT` memory — can send batch of 10-20 items (grouped by aggregate order). Each item's result independent.
- **MVP:** `sendBatch` with ordered array, each item processed idempotently; batch failure does not rollback successful items.

## 24. Offline Mutation Semantics

```typescript
// D05 offline-first (D05 §46)
async function createMemory(candidate: MemoryCandidate, ctx: AccessContext): Promise<MemoryRecord> {
  // 1. Validate via D05 Validation + Policy
  // 2. Write to Local Repository (durable) → return success to user immediately
  const record = await localMemoryRepository.create(candidate);
  // 3. Enqueue for sync (outbox pattern) — not blocking user
  await syncQueue.enqueue({
    idempotencyKey: `memory:${record.memoryId}:${record.version}`,
    entityId: record.memoryId,
    aggregateId: record.memoryId,
    operation: "UPSERT",
    version: record.version,
    payload: record, // sanitized
    accessContext: ctx,
  });
  // 4. Return — user sees success even if offline
  return record;
}
```

**Guarantee:** `Local success` is immediate; `Remote sync` is eventual.

## 25. Data Consistency Guarantees

- **Local:** Strong consistency (local DB transaction).
- **Remote:** Eventual consistency — after network recovery and successful sync, Local and Remote converge (per-aggregate version monotonic).
- **Journal:** Causal consistency — journal for same execution always ordered.
- **No global strong consistency** — acceptable for 8bitAI offline-capable.

## 26. Failure Taxonomy

| Failure | Retryable | State | Action |
|---------|-----------|-------|--------|
| `NETWORK_UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED` | true | RETRYING | Backoff, keep PENDING |
| `CONFLICT` | false | CONFLICT | Resolver → REMOTE_WINS/MERGE/ASK_USER |
| `VALIDATION_ERROR`, `PERMISSION_DENIED`, `SECURITY_VIOLATION` | false | FAILED | No retry, audit, requires fix |
| `INSFORGE_UNAVAILABLE` (5xx) | true | RETRYING | Backoff |
| `PAYLOAD_TOO_LARGE` | false | FAILED | Split or reject |

## 27. Observability & Diagnostics

**Metrics (without secrets):**

- `sync_queue_depth{state}` — PENDING/SENDING/RETRYING/CONFLICT
- `sync_queue_enqueue_total`, `sync_success_total`, `sync_conflict_total`, `sync_failed_total`
- `sync_retry_total`, `sync_backoff_duration`
- `sync_transport_latency`, `sync_batch_size`

**Diagnostics:**

- `SyncQueue.getStatus(): { pending, sending, retrying, conflict, failed, lastSyncAt }`
- Last error per item (code, retryable, not payload secrets)
- Network state: `online/offline`, `lastNetworkChange`

**Logging:** Structured, `idempotencyKey + aggregateId + attempt`, never full payload secrets.

## 28. Security & Privacy

- Payload sanitization: same as D07 §128 — redact `password, token, apiKey, privateKey` before enqueue.
- Transport: `HTTPS` MUST, token in header, not payload.
- At-rest: SyncQueue table SHOULD be encrypted (same as D05 §55 local DB encryption).
- Cross-user: `accessContext.userId` MUST be checked — User A queue items never visible to User B (D05 §6.1).
- Audit: Every `CONFLICT` and `FAILED` generates audit event.

## 29. Android Lifecycle Integration

- `APP_BACKGROUND`: pause dispatcher (keep queue durable, no network calls)
- `APP_FOREGROUND`: resume dispatcher if network available
- `PROCESS_DEATH`: recover durable queue (§18)
- `NETWORK_AVAILABLE`: trigger `SyncQueue.drain()`
- `NETWORK_LOST`: pause `SENDING`, keep `PENDING`
- Battery: if `isLowBattery && not charging` → defer non-critical batches (respect D06 §65 Battery Awareness)

## 30. TypeScript Interfaces / Contracts (Summary)

```typescript
interface ISyncQueue {
  enqueue(item: SyncQueueItem): Promise<void>;
  enqueueBatch(items: SyncQueueItem[]): Promise<void>;
  drain(): Promise<DrainResult>; // network-aware, ordered, idempotent
  getStatus(): Promise<SyncQueueStatus>;
  recover(): Promise<void>; // after process death
  pause(): Promise<void>;
  resume(): Promise<void>;
  remove(idempotencyKey: string): Promise<void>;
}

interface ISyncTransport { send(item: SyncQueueItem): Promise<SyncTransportResult>; sendBatch(items: SyncQueueItem[]): Promise<BatchSyncResult>; }

interface ISyncQueueRepository {
  save(item: SyncQueueItem): Promise<void>;
  get(idempotencyKey: string): Promise<SyncQueueItem | null>;
  listByState(state: SyncQueueItem["state"]): Promise<SyncQueueItem[]>;
  listByAggregate(aggregateId: string): Promise<SyncQueueItem[]>;
  update(item: SyncQueueItem): Promise<void>;
  remove(idempotencyKey: string): Promise<void>;
  listAll(): Promise<SyncQueueItem[]>;
}

interface IConflictResolver { resolve(conflict: SyncConflict, localItem: SyncQueueItem, remoteRecord: unknown): Promise<"REMOTE_WINS"|"LOCAL_WINS"|"MERGE"|"ASK_USER">; }
```

## 31. Repository & Service Architecture

```
src/core/sync/
├── SyncQueue.ts                 // ISyncQueue — durable queue + drain loop
├── SyncTransport.ts             // ISyncTransport → InsForge
├── SyncQueueRepository.ts       // ISyncQueueRepository — local durable table
├── ConflictResolver.ts          // IConflictResolver
├── SyncScheduler.ts             // Network-aware drain scheduler (distinct from D07A ExecutionScheduler)
├── SyncOutbox.ts                // Outbox pattern for atomic local+enqueue
└── __tests__/
    ├── SyncQueue.test.ts
    ├── Idempotency.test.ts
    └── Conflict.test.ts
```

**Dependencies:**

```
SyncQueue → SyncQueueRepository (durable) + SyncTransport (InsForge) + ConflictResolver
SyncTransport → InsForge HTTP + Auth (D06 Secure Storage)
SyncQueueRepository → Local DB (same as D05 LocalMemoryRepository DB, separate table)
```

**No circular:** SyncQueue does NOT depend on ExecutionEngine or MemoryService — they depend on SyncQueue via `enqueue()`.

## 32. Acceptance Criteria

| ID | Test | Expected |
|----|------|----------|
| SYNC-001 | Enqueue while offline | PENDING durable, local success immediate |
| SYNC-002 | Drain when online | PENDING → SENDING → SYNCED, removed from queue |
| SYNC-003 | Idempotency — same key twice | Second enqueue deduplicated, single sync, second returns ALREADY_APPLIED |
| SYNC-004 | Retry with backoff | NETWORK_UNAVAILABLE → RETRYING with nextRetryAt, drain after backoff |
| SYNC-005 | Non-retryable (PERMISSION_DENIED) | FAILED, no retry, audit |
| SYNC-006 | Ordering per aggregate | Items for same aggregate dispatched in version ASC |
| SYNC-007 | Dependency ordering | Item with dependsOn waits until dependency SYNCED |
| SYNC-008 | Conflict STALE | REMOTE_WINS, local discarded, audit |
| SYNC-009 | Conflict CONCURRENT (memory) | MERGE or REMOTE_WINS + audit, re-enqueue if MERGE |
| SYNC-010 | Process death during SENDING | After restart, SENDING→PENDING, resend same key → ALREADY_APPLIED or SYNCED |
| SYNC-011 | Process death during PENDING | Queue survives, drain after restart succeeds |
| SYNC-012 | Network lost during SENDING | Move to PENDING, resume on NETWORK_AVAILABLE |
| SYNC-013 | Journal ordering | Execution journal 001 before 002, never reordered |
| SYNC-014 | Batch idempotency | Batch of 5, one fails, 4 succeed — failed one retried alone |
| SYNC-015 | Cross-user isolation | User A queue not visible to User B |
| SYNC-016 | Backpressure | Queue full → enqueue returns QUEUE_FULL, critical journal still enqueued |
| SYNC-017 | Payload sanitization | Password in payload redacted before enqueue |
| SYNC-018 | Atomic local+enqueue (outbox) | Crash after local commit but before enqueue → outbox ensures enqueue on recovery |

## 33. Implementation Checklist

- [ ] SyncQueueItem contract + idempotencyKey generation
- [ ] SyncQueueRepository (durable table, survives process death)
- [ ] SyncTransport abstraction (send/sendBatch, idempotent receiver)
- [ ] Outbox pattern for atomic local+enqueue
- [ ] Drain loop (network-aware, ordered, batch, idempotent)
- [ ] Retry with exponential backoff + jitter (max 5)
- [ ] Conflict detection & resolver (STALE/CONCURRENT)
- [ ] Process death recovery (SENDING→PENDING, RETRYING timers)
- [ ] Network lifecycle integration (NETWORK_AVAILABLE/LOST)
- [ ] Backpressure (max queue size, max batch size)
- [ ] Observability (queue depth, retry count, latency)
- [ ] Security (sanitization, cross-user isolation, HTTPS)
- [ ] Tests: SYNC-001 → SYNC-018

## 34. Lock Conditions

D07B is considered **LOCKED** when:

- [x] Scope & non-goals explicit (not Scheduler, not Engine, not Memory authority)
- [x] Architectural position AFTER Engine/Scheduler, BEFORE InsForge
- [x] Authority boundary forbids bypass (no direct Remote, no direct Memory write)
- [x] Sync model local-first, eventual consistency
- [x] State machine PENDING→SENDING→SYNCED/FAILED/CONFLICT→RETRYING
- [x] Queue item contract with idempotencyKey, version, aggregateId, dependsOn
- [x] Idempotency (stable key, receiver ALREADY_APPLIED)
- [x] Ordering per aggregate + dependency chain
- [x] Retry + exponential backoff + jitter, bounded (max 5)
- [x] Network-aware dispatch, not lifecycle authority
- [x] Conflict detection & resolution explicit (STALE/CONCURRENT, REMOTE_WINS/MERGE)
- [x] SyncTransport abstraction (InsForge)
- [x] Local repository boundary (own table, outbox pattern)
- [x] Journal/Audit guarantees (append-only, ordered, never lost)
- [x] Process death recovery (SENDING→PENDING, idempotency prevents duplicate)
- [x] Crash safety & atomicity (outbox, atomic ack+remove)
- [x] Auth & permission re-check (token via Secure Storage, not payload)
- [x] Deduplication (before enqueue, before send, at receiver)
- [x] Backpressure (bounded queue, batch size)
- [x] Offline mutation semantics (local success immediate)
- [x] Security & privacy (sanitization, cross-user isolation, HTTPS, encryption)
- [x] Android lifecycle integration (foreground/background/network/battery)
- [x] TypeScript contracts & repository architecture
- [x] Acceptance matrix SYNC-001 → SYNC-018
- [x] Implementation checklist

> **END OF D07B — OFFLINE SYNCQUEUE & SYNCHRONIZATION SPECIFICATION**
> Next: D08 UI / Control Surface — now has stable backend: WHEN (D07A) + HOW (D07) + PERSISTENCE (D07B)

