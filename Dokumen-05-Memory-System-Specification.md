# D05 — 8bitAI Memory System Specification
> **Status:** DRAFT / Implementation Contract — Version 1.0-draft
> **Date:** 2026-09-12 — Kudus, ID
> **Authority:** D00 → D01 → D02 → D03 → D04 → D05
> **Normative language:** MUST / SHOULD / MAY
> **Position:** Fondasi Memory yang dapat langsung dipetakan ke MemoryService, MemoryRepository, EmbeddingService, MemoryPolicy, ContextRetriever — dengan D04 tetap otoritatif untuk Context Assembly

---

## 1. Purpose & Scope
Dokumen ini mendefinisikan sistem Memory 8bitAI sebagai fondasi penyimpanan, pengelolaan, retrieval, lifecycle, isolation, dan penyediaan konteks bagi Agent Core.
D05 memastikan bahwa:
- memory memiliki taxonomy dan scope yang jelas;
- memory antar-task dan antar-user terisolasi;
- LLM tidak memiliki authority langsung terhadap storage;
- User Knowledge tidak dapat ditulis bebas oleh Planner;
- memory dapat digunakan secara offline-first;
- semantic retrieval tidak menjadi single point of failure;
- Context Assembly D04 dapat memperoleh memory secara deterministic;
- implementasi dapat dilakukan tanpa mengubah kontrak D04.

D05 mencakup: Memory taxonomy, scope dan ownership, schema, lifecycle, CRUD contract, Retention dan TTL, Retrieval architecture, Embedding architecture, Memory write pipeline, Context Retriever, Privacy dan security, Offline-first dan synchronization, Authority dan isolation, Auditability, Testing dan acceptance criteria

D05 tidak memberikan authority eksekusi kepada Memory System.

## 2. Architectural Position
Memory berada di antara data persistence dan Agent Context Assembly.
```
                    ┌─────────────────────┐
                    │      Agent Core     │
                    │        D04          │
                    └──────────┬──────────┘
                               │
                               │ Context Request
                               ▼
                    ┌─────────────────────┐
                    │   ContextRetriever  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       Short-Term        Conversation        Task
          Memory            Memory           Memory
              │                │                │
              └────────────────┼────────────────┘
                               │
                       ┌───────▼───────┐
                       │ User Knowledge│
                       └───────┬───────┘
                               │
                       ┌───────▼───────┐
                       │ Long-Term Top-K│
                       └───────┬───────┘
                               │
                       ┌───────▼───────┐
                       │ Memory Storage│
                       └───────────────┘
```
Memory System MUST NOT menjadi Planner. Memory System MUST NOT mengeksekusi tools. Memory System MUST NOT menentukan tindakan Agent. Memory System hanya: Store, Retrieve, Update, Delete, Archive, Rank, Filter, Synchronize, Provide Context

## 3. Authority Model
Hierarki authority tetap:
```
D00 Constitution
      ↓
D01 Product Vision
      ↓
D02 System & Agent Architecture
      ↓
D03 Tool System
      ↓
D04 Agent Core & Planner
      ↓
D05 Memory System
```
Memory System tunduk kepada permission dan authority model yang telah ditetapkan sebelumnya. Secara khusus:
```
LLM → Planner → Structured Plan → Agent Core → MemoryPolicy / MemoryService → MemoryRepository → Storage
```
Tidak diperbolehkan: `LLM → Database` atau `Planner → UserKnowledgeRepository`

## 4. Memory Taxonomy
8bitAI menggunakan enam kategori utama:
1. Short-Term Memory
2. Conversation Memory
3. Task Memory
4. Long-Term Memory
5. User Knowledge
6. Retrieval Context — Retrieval Context bukan persistent memory. Ia merupakan hasil retrieval yang dikirim ke Context Assembly.

## 5. Memory Scope
Setiap memory MUST memiliki scope.
- GLOBAL, USER, CONVERSATION, TASK

Mapping:
| Memory | Scope |
|--------|-------|
| Short-Term | Conversation / Task |
| Conversation Memory | Conversation |
| Task Memory | Task |
| Long-Term Memory | User |
| User Knowledge | User |
| Retrieval Context | Runtime |

Identifier utama: `userId, conversationId, taskId, memoryId`

## 6. Isolation Rules
### 6.1 User Isolation
Memory milik `user-A` MUST NOT dapat diretrieve oleh `user-B` kecuali terdapat explicit authority mechanism. Default: `cross-user access = DENY`
### 6.2 Task Isolation
Task A `taskId=A` MUST NOT membaca Task Memory `taskId=B`. Default: `cross-task task-memory access = DENY`. Task memory dapat dipromosikan menjadi User Knowledge hanya melalui Memory Write Pipeline.
### 6.3 Conversation Isolation
Conversation A tidak boleh membaca Conversation Memory conversation B. `conversation-A X conversation-B`

## 7. Memory Identity
Setiap memory MUST memiliki:
```typescript
interface MemoryId { memoryId: string; }
interface MemoryScope { userId: string; conversationId?: string; taskId?: string; }
```
Rules: `userId → required`, `conversationId → required for conversation-scoped`, `taskId → required for task-scoped`. Tidak boleh ada memory scoped tanpa owner yang dapat diverifikasi.

## 8. Canonical Memory Schema
Minimum schema:
```typescript
interface MemoryRecord {
  memoryId: string;
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  metadata: MemoryMetadata;
  source: MemorySource;
  importance: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  archivedAt?: string;
  deletedAt?: string;
  version: number;
  embedding?: EmbeddingReference;
}
```

## 9. Memory Type
```typescript
type MemoryType = "short_term" | "conversation" | "task" | "long_term" | "user_knowledge";
```
Implementasi MUST menggunakan discriminated type, bukan string bebas.

## 10. Memory Metadata
```typescript
interface MemoryMetadata {
  tags?: string[];
  sourceType?: string;
  sourceId?: string;
  language?: string;
  contentHash?: string;
  sensitivity?: SensitivityLevel;
  confidenceReason?: string;
  custom?: Record<string, unknown>;
}
```
`custom` memungkinkan schema berkembang tanpa merusak core contract.

## 11. Memory Source
Memory MUST memiliki provenance.
```typescript
interface MemorySource {
  type: "user" | "agent" | "tool" | "system" | "import" | "promotion";
  sourceId?: string;
  createdBy?: string;
}
```

## 12. Confidence
`0.0 → 1.0` — Interpretasi: `0.00–0.29 LOW, 0.30–0.59 MEDIUM, 0.60–0.79 HIGH, 0.80–1.00 VERY_HIGH`. Confidence bukan permission. Memory dengan confidence tinggi tetap tidak otomatis memiliki authority.

## 13. Importance
`0.0 → 1.0` — Digunakan untuk ranking, retention, promotion, summarization, cleanup. Tidak boleh digunakan untuk bypass permission.

## 14. Short-Term Memory
Menyimpan informasi runtime aktif: current intent, temporary assumptions, tool result, intermediate reasoning. Karakteristik: high volatility, short TTL, low promotion priority. SHOULD memiliki TTL pendek.

## 15. Conversation Memory
Menyimpan informasi relevan terhadap satu conversation (format diminta, topik, keputusan). Scope: `userId + conversationId`. MUST NOT otomatis menjadi User Knowledge.

## 16. Task Memory
Menyimpan state berkaitan satu task: objective, state, intermediate result, tool output summary, validation result. Scope: `userId + taskId`. MUST memiliki taskId. Task A tidak boleh membaca task-B.

## 17. Long-Term Memory
Memory lintas conversation apabila permission mengizinkan: preferences, project context, patterns. Berbeda dari User Knowledge. Dapat berasal dari conversation/task/tool/system/user tetapi harus melalui policy.

## 18. User Knowledge
Memory valid sebagai pengetahuan jangka panjang tentang user: preferred format, conventions, persistent preferences, explicitly confirmed facts. Authority lebih tinggi dari candidate memory, tetapi bukan absolute.

## 19. Critical User Knowledge Rule
LLM MUST NOT directly write User Knowledge. Tidak diperbolehkan: `LLM → User Knowledge` atau `Planner → User Knowledge`. Yang diperbolehkan:
```
LLM / Agent → Candidate Memory → Validation → Memory Policy → Permission / Authority → Promotion → User Knowledge
```

## 20. Memory Write Pipeline
Canonical pipeline: `Candidate Memory → Validation → Policy → Permission / Authority → Store`. Untuk promotion: `Existing Memory → Promotion Candidate → Validation → Memory Policy → Permission / Authority → User Knowledge`. Tidak ada shortcut.

## 21. Candidate Memory
```typescript
interface MemoryCandidate {
  content: string;
  proposedType: MemoryType;
  scope: MemoryScope;
  source: MemorySource;
  confidence?: number;
  importance?: number;
  metadata?: MemoryMetadata;
}
```
Candidate bukan memory resmi. Candidate ≠ Stored Memory

## 22. Validation
Validation MUST memeriksa: schema, owner, scope, content validity, prohibited data, sensitivity, duplication, provenance, TTL, authority. Failure → REJECT dan MUST NOT masuk storage.

## 23. Memory Policy
Bertanggung jawab menentukan: CAN_WRITE, CAN_UPDATE, CAN_DELETE, CAN_PROMOTE, CAN_RETRIEVE, CAN_ARCHIVE
```typescript
interface MemoryPolicyDecision { allowed: boolean; reason: string; requiredPermission?: string; actions?: string[]; }
```

## 24. CRUD Contract
MemoryService menyediakan: `create(), read(), update(), delete(), archive()`
### 24.1 Create
`create(candidate: MemoryCandidate): Promise<MemoryRecord>` — MUST validate candidate, scope, policy, permission, generate memoryId, persist, enqueue embedding, audit.
### 24.2 Read
`read(memoryId: string, context: AccessContext): Promise<MemoryRecord | null>` — MUST verify authorization.
### 24.3 Update
`update(memoryId: string, patch: MemoryUpdate, context: AccessContext): Promise<MemoryRecord>` — MUST increment version.
### 24.4 Delete
Logical deletion by default `active → deleted`. Deleted MUST NOT appear in retrieval. Physical deletion MAY via retention policy.
### 24.5 Archive
`active → archived`. Archived tetap historis tetapi default retrieval `archived = excluded` kecuali explicitly requested dan authorized.

## 25. TTL
Memory MAY memiliki `expiresAt?: string;` Lifecycle: `CREATED → ACTIVE → EXPIRED → DELETED`. Expired MUST NOT masuk Context Assembly atau normal retrieval.

## 26. Default Lifecycle
`Candidate → Validation → Policy → Store → Active → TTL / Promotion / Archive → Expired / Archived / Deleted`

## 27. Promotion Rules
Promotion = perubahan level durability. Contoh: `Short-Term → Conversation → Task → Long-Term → User Knowledge` — tidak otomatis. Setiap promotion MUST melewati Validation, Policy, Authority.

## 28. Promotion Criteria
Candidate User Knowledge SHOULD: relevan jangka panjang, stabil, tidak hanya satu task, memiliki provenance, confidence memadai, tidak sensitif berlebihan, bukan credential, bukan temporary state. Explicit user statement SHOULD prioritas tinggi.

## 29. Retention Policy
| Type | Default Retention |
|------|-------------------|
| Short-Term | Short |
| Conversation | Conversation lifecycle |
| Task | Task lifecycle + retention |
| Long-Term | Long-lived |
| User Knowledge | Persistent until deletion/revocation |
Nilai TTL konkret SHOULD configurable via policy, bukan hard-coded di Agent Core.

## 30. Retrieval Architecture
Tiga mekanisme: 1. Keyword, 2. Semantic / Embedding, 3. Metadata Filtering
Pipeline: `Query → Scope Filter → Permission Filter → Metadata Filter → Keyword / Semantic Retrieval → Ranking → Threshold → Top-K → Context`

## 31. Keyword Retrieval
Untuk exact atau lexical matching. Ex: "8bitOS", "MatePad". SHOULD normalized tokenization.

## 32. Semantic Retrieval
```
Query → EmbeddingService → Vector → Vector Index → Similarity Search
```
Memungkinkan pencarian berdasarkan makna, bukan hanya exact keyword.

## 33. Metadata Filtering
MUST mendukung filter:
```typescript
interface MemoryFilter {
  userId?: string; conversationId?: string; taskId?: string;
  type?: MemoryType[]; tags?: string[]; sourceType?: string[];
  minImportance?: number; minConfidence?: number;
  includeArchived?: boolean; includeExpired?: boolean;
}
```
Security filters MUST diterapkan sebelum user-controlled filters.

## 34. Ranking
Dapat menggunakan: semantic similarity, keyword score, importance, confidence, recency, scope relevance. Conceptual score: `score = semanticWeight + keywordWeight + importanceWeight + confidenceWeight + recencyWeight + scopeWeight`. Bobot MUST configurable.

## 35. Deterministic Ranking
Jika dua memory score identik, ranking MUST deterministic tie-breaker. Ex: `score DESC, updatedAt DESC, memoryId ASC` — Top-K tidak nondeterministic.

## 36. Top-K
MUST mendukung `topK: number`
```typescript
interface RetrievalResult { memories: MemoryRecord[]; totalCandidates: number; query: string; retrievalMode: RetrievalMode; }
```
Jika `topK=5` maka maksimal lima memory.

## 37. Relevance Threshold
SHOULD memiliki `relevanceThreshold`. Memory dengan `score < threshold` MUST dikeluarkan — mencegah context window penuh yang tidak relevan.

## 38. Context Retrieval Contract
```typescript
interface ContextRetriever {
  retrieve(request: MemoryRetrievalRequest): Promise<MemoryRetrievalResult>;
}
interface MemoryRetrievalRequest {
  userId: string; conversationId?: string; taskId?: string;
  query: string; topK: number; relevanceThreshold?: number; filters?: MemoryFilter;
}
```

## 39. Context Assembly — D04 Compatibility
D05 MUST mempertahankan kontrak D04 secara persis.
```
Context Assembly: Intent + Short-Term + Conversation + Task + User Knowledge + Long-Term Top-K + Available Tools + Constraints
```
D05 hanya menyediakan memory components.

## 40. Context Assembly Responsibility
D05 menyediakan: Short-Term, Conversation, Task, User Knowledge, Long-Term Top-K. D04 menggabungkannya dengan Intent, Available Tools, Constraints menjadi Agent Context.

## 41. Embedding Abstraction
MUST diabstraksikan.
```typescript
interface EmbeddingService { embed(input: string): Promise<EmbeddingVector>; embedBatch(input: string[]): Promise<EmbeddingVector[]>; }
```
Provider-specific code tidak boleh bocor ke MemoryService.

## 42. Embedding Vector
```typescript
interface EmbeddingVector { values: number[]; dimension: number; provider: string; model: string; version: string; }
```
Memory MUST menyimpan metadata model/version.

## 43. Embedding Model Versioning
Identity: `provider + model + version + dimension`. Ex: `provider=X, model=embedding-model-A, version=1, dimension=N`. Vector dimension berbeda MUST NOT dicampur tanpa compatibility layer.

## 44. Re-Embedding
Jika model berubah: `OLD VECTOR → re-embedding queue → NEW VECTOR`. Memory content tidak boleh dianggap berubah hanya karena embedding berubah. SHOULD asynchronous.

## 45. Embedding Failure
Embedding failure MUST NOT menghentikan Agent Core. Fallback: `Semantic unavailable → Keyword Retrieval → Metadata Filtering → Continue Agent`. Memory tetap dapat disimpan tanpa embedding apabila policy mengizinkan. Embedding dapat dibuat kemudian via queue.

## 46. Offline-First Memory
MUST mendukung local-first:
```
Agent → MemoryService → Local Repository → Sync Queue → Remote Repository
```
Saat offline: READ → Local, WRITE → Local + Queue. Agent tidak boleh berhenti hanya karena remote unavailable.

## 47. Local Memory
Dapat menyimpan: memory records, metadata, embedding vectors, sync state, audit events. MUST tetap mengikuti permission dan isolation policy. Offline bukan alasan mengabaikan security boundary.

## 48. Sync Queue
```typescript
interface SyncEvent {
  eventId: string; memoryId: string;
  operation: "create"|"update"|"delete"|"archive";
  version: number; timestamp: string; payloadHash: string;
}
```
Queue MUST durable.

## 49. Eventual Consistency
Model: `LOCAL STATE → sync → REMOTE STATE` — target eventual consistency setelah koneksi tersedia.

## 50. Conflict Resolution
MUST deterministic. Primary: `version → timestamp → eventId`. Untuk field tertentu, MAY field-level merge. MUST dicatat sebagai audit event.

## 51. Delete Synchronization
Delete event MUST tidak hilang karena record lokal sudah dihapus. Gunakan tombstone: `memoryId, deletedAt, version` — dipertahankan sampai sync policy aman untuk physical deletion.

## 52. Privacy
MUST menerapkan: data minimization, purpose limitation, access control, retention, deletion, auditability.

## 53. Credential Exclusion
MUST NOT persist credentials: password, API key, token, private key, session secret. Harus ditolak atau disanitasi sebelum persistence.

## 54. Sensitive Data Handling
```typescript
type SensitivityLevel = "public" | "internal" | "sensitive" | "restricted";
```
Restricted MUST stricter access policy.

## 55. Encryption
At-rest SHOULD encryption. In-transit MUST secure transport. Key management MUST di luar MemoryRecord. MemoryRecord MUST NOT contain encryption keys.

## 56. Access Control
Every operation MUST have AccessContext.
```typescript
interface AccessContext {
  userId: string; conversationId?: string; taskId?: string;
  actorType: "user"|"agent"|"system"|"tool"; permissions: string[];
}
```
Authorization sebelum content dikembalikan.

## 57. Audit Trail
SHOULD menghasilkan audit event: CREATE, READ, UPDATE, DELETE, ARCHIVE, PROMOTE, RETRIEVE, SYNC, CONFLICT, POLICY_REJECT
```typescript
interface MemoryAuditEvent {
  eventId: string; memoryId?: string; actor: string;
  operation: string; timestamp: string;
  result: "success"|"denied"|"failed"; reason?: string;
}
```

## 58. Repository Contract
```typescript
interface MemoryRepository {
  create(record: MemoryRecord): Promise<MemoryRecord>;
  get(memoryId: string): Promise<MemoryRecord | null>;
  update(memoryId: string, patch: MemoryUpdate): Promise<MemoryRecord>;
  delete(memoryId: string): Promise<void>;
  archive(memoryId: string): Promise<void>;
  query(filter: MemoryFilter): Promise<MemoryRecord[]>;
}
```
Repository tidak menentukan business policy.

## 59. MemoryService Contract
```typescript
interface MemoryService {
  create(candidate: MemoryCandidate, context: AccessContext): Promise<MemoryRecord>;
  read(memoryId: string, context: AccessContext): Promise<MemoryRecord | null>;
  update(memoryId: string, patch: MemoryUpdate, context: AccessContext): Promise<MemoryRecord>;
  delete(memoryId: string, context: AccessContext): Promise<void>;
  archive(memoryId: string, context: AccessContext): Promise<void>;
  promote(memoryId: string, targetType: MemoryType, context: AccessContext): Promise<MemoryRecord>;
}
```

## 60. Component Responsibilities
- **MemoryService:** orchestration, validation, policy, authorization, lifecycle, audit, repository interaction
- **MemoryRepository:** persistence, query, transaction, local/remote storage
- **EmbeddingService:** embedding generation, provider abstraction, model version, batch
- **MemoryPolicy:** write permission, promotion rules, retention, sensitivity, access policy
- **ContextRetriever:** retrieval, filtering, ranking, threshold, Top-K

## 61. Component Dependency
```
ContextRetriever → MemoryRepository + EmbeddingService + MemoryPolicy
MemoryService → MemoryRepository + MemoryPolicy + EmbeddingService + AuditService
Planner MUST NOT depend directly on: MemoryRepository, Embedding DB, Vector DB
Planner menggunakan interface Agent/Memory layer.
```

## 62. Memory Access Flow
`User Request → Agent Core → Context Request → ContextRetriever → Authorization → Scope Filtering → Metadata Filtering → Keyword / Semantic Retrieval → Ranking → Threshold → Top-K → D04 Context Assembly`

## 63. Memory Write Flow
`Agent / User / Tool → Candidate Memory → Validation → Sensitivity Check → Memory Policy → Permission / Authority → MemoryService → MemoryRepository → Embedding Queue → Audit`

## 64. User Knowledge Promotion Flow
`Candidate → Validation → Is it long-term? → Policy → Permission → Promotion → User Knowledge` — Tidak ada `Planner → User Knowledge`

## 65. Failure Isolation
Memory subsystem failure SHOULD isolated. Vector DB unavailable → Keyword retrieval → Agent continues. Remote unavailable → Local → Sync later. Embedding unavailable → Memory still usable. Memory failure MUST NOT automatically become Agent Core failure.

## 66. Schema Extensibility
MUST dapat diperluas tanpa breaking change via `metadata.custom` dan `schemaVersion`. Future memory types SHOULD additive. Existing consumers MUST tetap dapat membaca schema lama.

## 67. Versioning
`version: number` (record), `schemaVersion: number` (schema), `provider/model/version/dimension` (embedding) — ketiganya lifecycle terpisah.

## 68. Memory State Machine
```
             ┌──────────────┐
             │   CANDIDATE  │
             └──────┬───────┘
                    │ validate
                    ▼
             ┌──────────────┐
             │    ACTIVE    │
             └──┬────┬───┬─┘
                │    │   │
           expire│    │   │archive
                │    │   │
                ▼    │   ▼
          ┌────────┐ │ ┌────────┐
          │EXPIRED │ │ │ARCHIVED│
          └────┬───┘ │ └────┬───┘
               │      │      │
               └──────┴──────┘
                      ▼
                 ┌────────┐
                 │ DELETED│
                 └────────┘
```
Promotion bukan state utama, melainkan perubahan type.

## 69. Retrieval Security Ordering
Security filters MUST happen before ranking. Correct: `Authorization → Scope Filter → Metadata Filter → Retrieval → Ranking`. Incorrect: `Retrieval → Ranking → Authorization` — unauthorized memory tidak boleh masuk candidate ranking.

## 70. Deterministic Retrieval Contract
Given same query, same scope, same dataset, same embedding model/version, same policy, same ranking config → result MUST deterministic. Tie-breaker wajib.

## 71. Context Freshness
ContextRetriever MUST exclude: deleted, expired, unauthorized, invalid. Default: archived = excluded.

## 72. Memory Deduplication
SHOULD detect duplicate via `contentHash`, semantic similarity, source identity. SHOULD NOT proliferate duplicate tanpa alasan. MUST NOT merge memories belonging to different users.

## 73. Memory Consolidation
Long-running MAY consolidation: `many related memories → summary → validated memory`. MUST preserve provenance. MUST NOT silently upgrade untrusted info into User Knowledge.

## 74. Context Budget
SHOULD support `maxTokens?: number;` — mempertimbangkan relevance, importance, scope, token cost. D04 tetap final Context Assembly budget.

## 75. Memory Observability
SHOULD expose metrics: `memory_create_total, memory_read_total, memory_update_total, memory_delete_total, memory_retrieval_total, memory_retrieval_latency, memory_embedding_latency, memory_embedding_failure, memory_sync_queue_size, memory_sync_conflict, memory_policy_rejection` — MUST NOT expose raw sensitive content.

## 76. Testing Strategy
Dibagi menjadi: Unit, Integration, Security, Isolation, Lifecycle, Retrieval, Embedding, Offline, Synchronization, End-to-End

## 77. Mandatory Acceptance Test — Task Isolation
Given Task A → Memory A, Task B → Memory B, Task A retrieval MUST NOT return Memory B. Expected: Memory B = 0 results

## 78. Mandatory Acceptance Test — Expiration
Given `memory.expiresAt < now`, retrieval MUST exclude. Expected: expired memory ∉ Context Assembly

## 79. Mandatory Acceptance Test — Deletion
Given `memory.deletedAt != null`, retrieval MUST NOT return. Expected: `retrieve(memoryId) = null`

## 80. Mandatory Acceptance Test — User Knowledge Authority
Given Planner mencoba `create(User Knowledge)` directly → Expected: REJECT — hanya via authorized Memory Policy pipeline.

## 81. Mandatory Acceptance Test — Top-K
Given `topK=5` → retrieval MUST return `<=5` authorized, valid, relevant memories.

## 82. Mandatory Acceptance Test — Determinism
Repeated identical retrieval: query Q, scope S, dataset D, configuration C → MUST ordering sama.

## 83. Mandatory Acceptance Test — Embedding Failure
Simulate `EmbeddingService = unavailable` → Expected: Agent Core continues dan fallback ke keyword/metadata.

## 84. Mandatory Acceptance Test — Cross-User Isolation
Given User A → Memory A, User B → Memory B, User A MUST NOT retrieve Memory B.

## 85. Mandatory Acceptance Test — Offline
Saat remote unavailable: create/read/update untuk memory local SHOULD tetap bekerja. Write MUST masuk sync queue.

## 86. Mandatory Acceptance Test — Sync
Setelah connectivity kembali: `local changes → sync queue → remote` MUST converge sesuai conflict-resolution policy.

## 87. Mandatory Acceptance Test — Schema Extensibility
Menambahkan `metadata.custom.newField` tidak boleh merusak pembacaan schema existing.

## 88. Security Acceptance Tests
Wajib uji: unauthorized read/write, cross-user/task/conversation access, credential persistence, sensitive access, deleted/expired/archived retrieval — semua mengikuti policy.

## 89. D04 Contract Compatibility
D05 MUST NOT mengubah: `Intent + Short-Term + Conversation + Task + User Knowledge + Long-Term Top-K + Available Tools + Constraints` — D05 hanya menyediakan memory inputs.

## 90. Implementation Mapping
```
D05 → MemoryService → MemoryPolicy + MemoryRepository + EmbeddingService + AuditService
    → ContextRetriever → MemoryRepository + EmbeddingService + MemoryPolicy
    → SyncQueue → SyncEngine → ConflictResolver
```

## 91. Recommended Internal Module Structure
```
memory/
├── domain/
│   ├── MemoryRecord.ts
│   ├── MemoryType.ts
│   ├── MemoryScope.ts
│   ├── MemoryCandidate.ts
│   ├── MemoryMetadata.ts
│   └── MemoryState.ts
├── service/
│   ├── MemoryService.ts
│   ├── ContextRetriever.ts
│   └── MemoryPromotionService.ts
├── policy/
│   ├── MemoryPolicy.ts
│   ├── RetentionPolicy.ts
│   └── SensitivityPolicy.ts
├── repository/
│   ├── MemoryRepository.ts
│   ├── LocalMemoryRepository.ts
│   └── RemoteMemoryRepository.ts
├── embedding/
│   ├── EmbeddingService.ts
│   ├── EmbeddingProvider.ts
│   └── EmbeddingIndex.ts
├── sync/
│   ├── SyncQueue.ts
│   ├── SyncEngine.ts
│   └── ConflictResolver.ts
└── audit/
    └── MemoryAuditService.ts
```
Struktur bersifat guidance; kontrak interface lebih authoritative daripada folder.

## 92. Non-Goals
D05 tidak mendefinisikan: model LLM, Planner, Tool execution, Android integration, UI, authentication provider, specific vector database, specific embedding vendor, specific cloud provider. Provider-agnostic.

## 93. Design Principles
1. Memory is data, not authority.
2. LLM proposes; policy decides.
3. Scope before retrieval.
4. Authorization before exposure.
5. User Knowledge requires promotion.
6. Expired means unavailable.
7. Deleted means non-retrievable.
8. Offline must not destroy local capability.
9. Embedding is an enhancement, not a single point of failure.
10. Retrieval must be deterministic.
11. Schema must be extensible.
12. Provenance must be preserved.

## 94. Final Contract Summary
```
MemoryService → MemoryPolicy + MemoryRepository + EmbeddingService + AuditService
ContextRetriever → MemoryRepository + EmbeddingService + MemoryPolicy

Taxonomy: Short-Term, Conversation, Task, Long-Term, User Knowledge
Isolation: userId, conversationId, taskId
Write: Candidate → Validation → Policy → Permission/Authority → Store
Retrieval: Keyword + Semantic + Metadata → Ranking → Threshold → Top-K
Offline: Local → Sync Queue → Remote → Conflict Resolution → Eventual Consistency
Context: Intent + Short-Term + Conversation + Task + User Knowledge + Long-Term Top-K + Available Tools + Constraints
```

## 95. D05 Acceptance Gate
D05 dianggap IMPLEMENTATION-READY apabila seluruh kondisi terpenuhi: taxonomy dikunci, scope dikunci, cross-user/task isolation, CRUD, archive/delete dibedakan, TTL/lifecycle, promotion pipeline, User Knowledge boundary, keyword/semantic/metadata filtering, ranking + tie-breaker, Top-K, threshold, embedding abstraction, model/version/dimension, re-embedding, embedding fallback, offline-first, sync queue, conflict resolution, eventual consistency, credential exclusion, sensitive handling, encryption, access control, audit trail, Context Assembly D04 dipertahankan, acceptance tests, schema extensibility.

> **Status:** D05 — Memory System Specification: ARCHITECTURALLY ALIGNED / IMPLEMENTATION CONTRACT
> Hierarki sekarang: D00 → D01 → D02 → D03 → D04 → D05 → D06 Android Integration
> Dengan D05 ini, fondasi memory sudah dikunci sebelum Android Integration. D06 dapat menggunakan kontrak local memory, sync queue, offline-first, permission, dan audit yang sudah ditetapkan tanpa mengubah fondasi Agent Core.

