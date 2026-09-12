# Dokumen 04 — Agent Core & Planner Specification
> **Status:** DRAFT v1.0 — Menunggu Review
> **Induk:** D00 Master Constitution (FINAL) > D01 Product Vision > D02 Architecture v1.1 (ALIGNED) > D03 Tool System (ALIGNED)
> **Tanggal:** 12 September 2026 — Kudus, ID
> **Otoritas:** Jika konflik, D00 menang. D04 tidak boleh membuat aturan yang bertentangan dengan D00. Phase mengacu D00 §20.
> **Prinsip:** LLM bukan authority eksekusi. LLM hanya menghasilkan `Structured Plan`; sistem yang memvalidasi, mengizinkan, dan mengeksekusi.

---

## 1. Purpose & Scope

D04 mendefinisikan **Agent Core & Planner** — otak orkestrasi 8bitAI (D00 Bab 5.1, D02 §3.2) yang mengubah `User Intent → Structured Plan → Verified Result`.

**Scope D04:**
- Agent Core responsibilities & boundaries
- Runtime lifecycle `Observe → Understand → Plan → Permission → Act → Verify → Reflect`
- Planner architecture (LLM sebagai generator Plan terstruktur, bukan executor)
- Plan Contract (Plan/Step/Verification) — kontrak JSON yang dapat divalidasi
- Verifier, Retry/Recovery, Human-in-the-loop, Task Memory integration
- **Bukan scope D04:** Implementasi tool (D03), Memory storage detail (akan di D05), Android Intent detail (D06)

**Validasi Konstitusi:**
- [x] Tool Registry satu-satunya jalur eksekusi (D00 Rule 03, D03 §3)
- [x] Agent Core hanya tahu `ID / Description / Schema / Permission / Risk` (D01 Bab 21)
- [x] L0-L4 otoritatif, LOW/MED/HIGH label UI (Keputusan 12 Sep Poin #2)
- [x] Verifier wajib dalam siklus `Think → Act → Verify` (D00 Bab 2, D02 §3.6)
- [x] Phase D00 §20 otoritatif

---

## 2. Authority & Alignment

```
D00 §5.1 Agent Core — FINAL
  ↓
D01 Bab 7-8 Agent Engine & Tool System
  ↓
D02 §3.2 & §3.6 Agent Core + Execution Engine
  ↓
D03 Tool Registry & MVP Tool Set v1 (extensible)
  ↓
D04 — Agent Core & Planner (dokumen ini) — IMPLEMENTATION CONTRACT
```

**Aturan hirarki:**
1. D04 **tidak boleh** menambah permission level baru di luar L0-L4. Hanya menggunakan yang didefinisikan D03.
2. D04 **tidak boleh** hard-code 9 tools MVP sebagai daftar final. Tool discovery harus via `registry.getToolSchemasForLLM()` (D03 §3.2) — extensible.
3. D04 **tidak boleh** mengubah definisi `Task Memory = terikat lifecycle Task` (Keputusan Poin #3).
4. D04 **tidak boleh** mengubah Phase Order D00 §20.

---

## 3. Agent Core Responsibilities

**Single Responsibility (D00 Bab 5.1):** Mengubah Goal → Plan → Execution → Verification. Tidak mengandung logika tool atau model langsung.

| Tanggung Jawab | Dilakukan | TIDAK Dilakukan |
|----------------|-----------|-----------------|
| **Understand** | Intent classification, entity extraction, context assembly | Tidak memanggil tool langsung |
| **Plan** | Generate `Structured Plan` via Planner | Tidak mengeksekusi plan |
| **Delegate** | Kirim Plan ke `Plan Validator → Permission Gate → Tool Registry` | Tidak bypass gate |
| **Verify** | Panggil Verifier untuk `Result vs Expected` | Tidak pura-pura SUCCESS (D00 Bab 17) |
| **Reflect & Remember** | Simpan ke Task Memory / Long-Term jika relevan | Tidak simpan semua chat otomatis (D00 Bab 5.4) |
| **Report** | Rangkum hasil + next action | Tidak expose credential (D00 Bab 18) |

**Boundary keras:**
```
Agent Core ──X──► Tool.execute()          // DILARANG
Agent Core ─────► ToolRegistry.execute()  // VIA GATE — WAJIB
Agent Core ──X──► External API            // DILARANG — harus via Tool
Agent Core ─────► ModelLayer.chat()       // BOLEH — untuk Planner & Verifier
```

---

## 4. Agent Runtime Lifecycle — Otoritatif

### 4.1 Siklus Lengkap

```
                    ┌─────────────────────────────────┐
                    │           USER INTENT           │
                    │  "Cari materi Android CLI,      │
                    │   rangkum dan simpan"           │
                    └──────────────┬──────────────────┘
                                   ▼
                    ┌─────────────────────────────────┐
     ┌─────────────►│      OBSERVE & CONTEXT ASSEMBLY │◄─────────────┐
     │              │  Kumpulkan: Short-Term,          │               │
     │              │  Conversation, Task, User        │               │
     │              │  Knowledge, Tool Schemas         │               │
     │              └──────────────┬──────────────────┘               │
     │                             │ User Intent + Context            │
     │                             ▼                                  │
     │              ┌─────────────────────────────────┐               │
     │              │           PLANNER (LLM)         │               │
     │              │  Generate Structured Plan (JSON)│               │
     │              └──────────────┬──────────────────┘               │
     │                             │ Plan (belum tereksekusi)         │
     │                             ▼                                  │
     │              ┌─────────────────────────────────┐               │
     │              │        PLAN VALIDATOR           │  ◄── BUKAN LLM│
     │              │  Schema valid? Tool ada?        │     Rule-based│
     │              │  Permission valid? Cycle?       │               │
     │              └──────────────┬──────────────────┘               │
     │                             │ Valid / Invalid                  │
     │              ┌──────────────┴──────────────────┐               │
     │              │                                 │               │
     │         INVALID                           VALID                │
     │              │                                 ▼               │
     │              │              ┌─────────────────────────────────┐│
     │              │              │       PERMISSION GATE (L0-L4)   ││
     │              │              │  HIGH? → AWAITING_APPROVAL     ││
     │              │              └──────────────┬──────────────────┘│
     │              │                             │ Allowed / Blocked │
     │              │              ┌──────────────┴──────────────────┐│
     │              │              │                                 ││
     │              │         BLOCKED / REQUIRES_CONFIRM         ALLOWED
     │              │              │                                 ││
     │              │              ▼                                 ▼│
     │              │   ┌─────────────────┐            ┌─────────────────┐
     │              │   │  ASK_USER /     │            │ TOOL REGISTRY   │
     │              │   │  HUMAN-IN-LOOP  │            │ Execute Step 1..n│
     │              │   └────────┬────────┘            └────────┬────────┘
     │              │            │                              │ Result
     │              │            └──────────┬───────────────────┘
     │              │                       ▼
     │              │        ┌─────────────────────────────────┐
     │              │        │           VERIFIER              │
     │              │        │  Result vs Expected Output      │
     │              │        │  Rule + LLM Judge               │
     │              │        └──────────────┬──────────────────┘
     │              │                       │ PASS / RETRY / REPLAN / ASK
     │              │        ┌──────────────┼──────────────┐
     │              │        │              │              │
     │              │     PASS           RETRY/REPLAN   ASK_USER
     │              │        │              │              │
     │              │        ▼              └──────┬───────┘
     │              │  ┌──────────┐                │
     │              └─►│ REFLECT  │◄───────────────┘
     │                 │ & REPORT │  (loop max 3x, lihat §13)
     │                 └────┬─────┘
     │                      ▼
     │                 ┌──────────┐
     └─────────────────┤ COMPLETE │
                       └──────────┘
```

**Prinsip kunci:** LLM **hanya** ada di kotak `PLANNER` dan sebagai *helper* di `VERIFIER`. Semua kotak lain adalah **deterministic, rule-based, dan tidak dapat di-bypass**. LLM tidak pernah memanggil tool.

---

## 5. Context Assembly

Sebelum Planner dipanggil, Agent Core merakit **Context Packet** — satu-satunya informasi yang dilihat Planner.

```typescript
interface ContextPacket {
  // 1. User Intent (sudah diparse)
  intent: {
    raw: string                    // "Cari materi Android CLI, rangkum dan simpan"
    normalized: string             // lowercase, trimmed
    language: "id"|"en"
  }
  // 2. Memory — batas yang jelas (Keputusan Poin #3)
  memory: {
    shortTerm: Message[]           // 10-20 pesan terakhir (D00 Bab 5.4)
    conversation: string           // ringkasan percakapan (TTL 7-30 hari)
    task?: TaskMemory              // hanya jika ada taskId aktif — terikat lifecycle
    userKnowledge: Record<string,string> // ex: { preferred_language:"id", project:"8bitAI" }
    longTerm: Array<{content:string, relevance:number}> // top 3 relevan
  }
  // 3. Tool Schemas — DARI REGISTRY, bukan hard-code (D03 §3.2)
  availableTools: Array<{ id:string, description:string, inputSchema:JSONSchema, permissionLevel:0|1|2|3|4 }>
  // 4. System Constraints
  constraints: {
    autonomyLevel: "Manual"|"Assisted"|"Semi-Autonomous"|"Autonomous" // D00 Bab 6
    maxSteps: number               // default 8 untuk MVP, cegah infinite loop (D01 Bab 7.2)
    allowedCategories?: string[]   // optional filter
  }
  // 5. Task Info (jika lanjutan task)
  task?: { id:string, goal:string, status:"Planning"|"Running", attempt:number }
}
```

**Aturan Context Assembly:**
- `availableTools` **wajib** diambil via `registry.getToolSchemasForLLM()` — tidak ada daftar statis 9 tools di Planner. Jika tool baru diregister (ex: `calendar_create`), ia otomatis muncul di context berikutnya.
- `shortTerm` + `conversation` diringkas jika > 4000 tokens (sliding window)
- `task` memory hanya dimasukkan jika `taskId` ada — isolasi per-task (D02 §3.5)
- Tidak ada credential atau API key di Context Packet (D00 Bab 18)

---

## 6. Planner Architecture

### 6.1 Peran Planner — Generator, Bukan Executor

```
Planner = LLM + Structured Output Contract + Guardrails

Input:  ContextPacket
Output: Structured Plan (JSON) — BELUM dieksekusi
Authority: TIDAK ADA — output harus divalidasi validator sebelum eksekusi
```

**Planner TIDAK boleh:**
- Memanggil tool
- Menghasilkan teks bebas tanpa JSON
- Menentukan apakah HIGH butuh approval (itu tugas Permission Gate)
- Mengakses file atau web langsung

### 6.2 Planner Prompt Contract (Ringkas)

```
You are 8bitAI Planner. Generate ONLY a Structured Plan JSON.

RULES:
- Use ONLY tools from availableTools. Do not invent tools.
- Each step must have: id, tool, input (valid per inputSchema), expectedOutput, verification
- permissionLevel is informational — system will enforce via gate
- Max {maxSteps} steps. If task needs more, split into phases and ask user.
- Respond with JSON only, no markdown, no explanation.

Context: {ContextPacket}
```

Model dipanggil via `ModelLayer` (D02 §3.3) dengan `response_format: json_object` atau function calling.

---

## 7. Tool Discovery & Selection

Planner memilih tool **hanya** dari `availableTools` di Context Packet.

**Proses:**
1. `ToolRegistry.getToolSchemasForLLM()` → `[{id, description, inputSchema, permissionLevel}]`
2. Planner LLM membaca `description` → pilih `id` yang paling relevan
3. Planner mengisi `input` sesuai `inputSchema`
4. Validator (§8) cek: `tool id ada? input valid?`

**Contoh discovery (extensible proof):**
- Saat MVP v1: `availableTools` berisi 9 tools
- Setelah register `calendar_create` (Phase 5): `availableTools` berisi 10 tools — Planner otomatis bisa memilihnya tanpa update prompt D04

**Anti hard-code:** Dilarang menulis di kode Planner: `if (intent.includes("calendar")) use calendar_create`. Harus via LLM reasoning atas `description`.

---

## 8. Plan Contract — Structured Plan (Otoritatif)

### 8.1 Schema `Plan`

```typescript
interface Plan {
  version: "1.0"
  goal: string                     // tujuan ternormalisasi
  reasoning: string                // 1-2 kalimat — untuk observability, tidak untuk eksekusi
  steps: Step[]                    // 1..maxSteps, DAG berurutan (berarti Step 2 dapat pakai output Step 1 via placeholder)
  estimatedRisk: 0|1|2|3|4         // max permissionLevel di steps — untuk UI badge
  requiresApproval: boolean        // true jika ada step L3/L4
}

interface Step {
  id: string                       // "step-1", unik dalam plan
  tool: string                     // harus ada di registry, ex: "web_search"
  input: Record<string, any>       // harus valid per tool.inputSchema
  preconditions?: string[]         // ex: ["step-1 SUCCESS"] — untuk future DAG, MVP: sequential
  expectedOutput: string           // deskripsi hasil yang diharapkan — untuk Verifier
  verification: {
    rule: string                   // ex: "results.length > 0" atau "content.includes('Android')"
    onFail: "RETRY"|"REPLAN"|"ASK_USER" // strategi jika step ini gagal
  }
  permissionLevel: 0|1|2|3|4       // copy dari tool definition — informational
}
```

### 8.2 JSON Schema (untuk validasi)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version","goal","steps"],
  "properties": {
    "version": { "const": "1.0" },
    "goal": { "type": "string", "minLength": 5, "maxLength": 500 },
    "reasoning": { "type": "string", "maxLength": 500 },
    "steps": {
      "type": "array", "minItems": 1, "maxItems": 8,
      "items": {
        "type": "object",
        "required": ["id","tool","input","expectedOutput","verification","permissionLevel"],
        "properties": {
          "id": { "type": "string", "pattern": "^step-\\d+$" },
          "tool": { "type": "string" },
          "input": { "type": "object" },
          "expectedOutput": { "type": "string", "minLength": 5 },
          "verification": {
            "type": "object",
            "required": ["rule","onFail"],
            "properties": {
              "rule": { "type": "string" },
              "onFail": { "enum": ["RETRY","REPLAN","ASK_USER"] }
            }
          },
          "permissionLevel": { "enum": [0,1,2,3,4] }
        }
      }
    },
    "estimatedRisk": { "enum": [0,1,2,3,4] },
    "requiresApproval": { "type": "boolean" }
  }
}
```

### 8.3 Plan Validator — Rule-Based (Bukan LLM)

```typescript
function validatePlan(plan: Plan, registry: ToolRegistry): ValidationResult {
  // 1. Schema valid
  if (!ajv.validate(planSchema, plan)) return { valid:false, reason: ajv.errors }

  // 2. Semua tool ada di registry (extensible check — bukan hard-code list)
  for (const s of plan.steps) {
    const tool = registry.get(s.tool)
    if (!tool) return { valid:false, reason:`Tool ${s.tool} not registered` }

    // 3. Input valid per tool.inputSchema
    if (!ajv.validate(tool.inputSchema, s.input)) return { valid:false, reason:`Step ${s.id} invalid input` }

    // 4. permissionLevel cocok dengan registry
    if (s.permissionLevel !== tool.permissionLevel) return { valid:false, reason:`Step ${s.id} permission mismatch` }

    // 5. Cek cycle / preconditions (MVP: sequential, jadi selalu valid)
  }

  // 6. Max steps
  if (plan.steps.length > 8) return { valid:false, reason:"Too many steps" }

  return { valid:true }
}
```

Jika `valid:false` → Planner dipanggil ulang dengan `error + previous plan` (max 1 retry). Jika masih gagal → `ASK_USER`.

---

## 9. Execution Orchestration

Setelah `validatePlan() = PASS` dan `Permission Gate = ALLOWED`:

```
For each step in plan.steps (sequential MVP):
  1. Registry.execute(step.tool, step.input, { userId, taskId, autonomyLevel })
     → ToolResult
  2. Simpan ke Task Memory: { stepId, tool, input, output, status, duration }
  3. Jika status == REQUIRES_CONFIRMATION → pause, tunggu user via ask_user
  4. Jika status == FAILED → handle per §13-14
  5. Jika status == SUCCESS → lanjut step berikutnya

Setelah semua step:
  → Verifier (§11)
```

**Catatan:** Execution Engine (D02 §3.6) yang menjalankan loop ini, bukan Agent Core. Agent Core hanya orkestrasi.

---

## 10. Permission Gate Integration

Gate dipanggil **per-step**, bukan per-plan (D02 §3.7).

```typescript
for (const step of plan.steps) {
  const gate = permissionGate.canExecute(step.permissionLevel, context.autonomyLevel)
  if (!gate.allowed) {
    // HIGH di mode Manual/Assisted → pause
    return { status:"AWAITING_APPROVAL", step, uiLabel:"HIGH", message: gate.message }
  }
  // L0-L2 atau HIGH di Autonomous → lanjut execute
}
```

UI menampilkan badge `estimatedRisk` di Plan Preview Card sebelum eksekusi: `Plan: 4 steps — Risk: MEDIUM — Requires Approval: No`.

---

## 11. Verifier Architecture

Verifier **wajib** ada (D00 Bab 2: Verify). Dua lapis:

### 11.1 Rule Verifier (deterministik, utama)

```typescript
function ruleVerify(step: Step, result: ToolResult): VerifyResult {
  // Contoh rule: "results.length > 0", "content.length > 100", "launched == true"
  // Dievaluasi dengan safe evaluator (tidak eval sembarangan)
  const pass = evaluateRule(step.verification.rule, result.data)
  return pass ? { status:"PASS" } : { status:"FAIL", reason:`Rule failed: ${step.verification.rule}` }
}
```

### 11.2 LLM Judge (sekunder, untuk semantik)

Dipanggil hanya jika `ruleVerify = PASS` tapi butuh cek semantik, atau jika rule tidak cukup.

```
Prompt Judge: "Goal: {plan.goal}, Expected: {step.expectedOutput}, Actual: {result.data}. Apakah actual memenuhi expected? Jawab JSON {pass:boolean, reason:string}"
```

Model dipanggil via `ModelLayer` dengan `temperature: 0`.

### 11.3 Gabungan

```typescript
async function verify(plan: Plan, results: ToolResult[]): Promise<VerifyResult> {
  for (let i=0; i<plan.steps.length; i++) {
    const rule = ruleVerify(plan.steps[i], results[i])
    if (rule.status === "FAIL") return rule // langsung FAIL
    // Jika rule PASS dan step butuh semantik, panggil LLM Judge
    if (needsSemanticCheck(plan.steps[i])) {
      const judge = await llmJudge(plan.steps[i], results[i])
      if (!judge.pass) return { status:"FAIL", reason: judge.reason }
    }
  }
  // Verifikasi goal keseluruhan
  return { status:"PASS" }
}
```

---

## 12. Verification Rules

Setiap `Step.verification.rule` harus spesifik, bukan generik.

| Tool | Contoh `expectedOutput` | Contoh `verification.rule` | `onFail` |
|------|-------------------------|----------------------------|----------|
| `web_search` | "3 hasil relevan Android CLI" | `results.length >= 2` | REPLAN (coba query lain) |
| `web_fetch` | "Konten mengandung definisi CLI" | `content.length > 500 && content.includes('CLI')` | RETRY (fetch ulang) |
| `file_write` | "File rangkuman terbuat" | `bytesWritten > 0` | RETRY |
| `memory_save` | "Preferensi tersimpan" | `saved == true` | ASK_USER (relevance rendah?) |

**Aturan:** `onFail` di Step menentukan strategi, bukan Verifier yang menebak.

---

## 13. Retry & Recovery

| Kondisi | Strategi | Max | Penjelasan |
|---------|----------|-----|------------|
| `ToolResult.retryable == true` (TIMEOUT, NETWORK) + L0-L3 | **RETRY** step yang sama | 2x dengan backoff 1s, 3s | L4 tidak pernah retry otomatis |
| `Rule FAIL` + `step.verification.onFail == RETRY` | **RETRY** step | 1x | Jika masih FAIL → REPLAN |
| `Rule FAIL` + `onFail == REPLAN` | **REPLAN** — panggil Planner ulang dengan `previousPlan + failureReason + results` | 1x | Planner buat plan alternatif |
| `Validation FAIL` | **REPLAN** Planner | 1x | Jika masih FAIL → ASK_USER |
| Loop total | **Batasi 3 siklus** `Plan→Execute→Verify` | 3 | Jika masih FAIL → `FAILED` dan laporkan ke user |

**Recovery tidak boleh infinite loop** (D01 Bab 7.2 — batas maksimum langkah).

---

## 14. Failure Handling

Status akhir Task (D00 Bab 17) — Agent tidak boleh pura-pura SUCCESS:

```
PASS          → SUCCESS — simpan ke Task Memory + Long-Term jika relevan → Report
RETRY habis   → PARTIAL_SUCCESS atau FAILED — tergantung berapa step yang PASS
BLOCKED       → BLOCKED — butuh permission/autonomy change
REQUIRES_CONFIRMATION (user cancel) → BLOCKED
REPLAN habis  → FAILED — diagnose + tawarkan ASK_USER
ASK_USER      → WAITING — tunggu input user, lalu lanjutkan dari step tersebut
```

Semua status dicatat di Task Memory dan `tool_logs` untuk observability.

---

## 15. Task Memory Integration

**Definisi (Keputusan Poin #3):** Task Memory = memory terikat lifecycle/context suatu Task, bukan User Knowledge.

```typescript
interface TaskMemory {
  taskId: string
  goal: string
  plan: Plan
  steps: Array<{ stepId, tool, input, result, status, durationMs, timestamp }>
  verifierResult: VerifyResult
  status: "Planning"|"Running"|"AwaitingApproval"|"Verifying"|"Completed"|"Failed"
  createdAt: string
  updatedAt: string
  expiresAt?: string // TTL, ex: 7 hari setelah Completed
}
```

**Alur:**
1. Saat task dibuat → buat `TaskMemory` dengan `status: Planning`
2. Setiap `ToolResult` → append ke `steps`
3. Setelah Verifier PASS → `status: Completed`, simpan ringkasan ke Long-Term jika `relevance > threshold` (D00 Bab 5.4)
4. TTL: Task Memory dihapus/diarsip setelah `expiresAt`, Long-Term tetap

**Isolasi:** `memory_search` dengan `taskId` hanya mencari di Task Memory task tersebut + Long-Term/User Knowledge global. Tidak cross-task.

---

## 16. Conversation / Long-Term / User Knowledge Boundaries

| Memory | Sumber | Kapan Ditulis | Kapan Dibaca | TTL |
|--------|--------|---------------|--------------|-----|
| **Short-Term** | Pesan aktif (RAM) | Setiap turn | Setiap Context Assembly | Hilang saat restart |
| **Conversation** | Ringkasan chat (InsForge) | Setelah 5-10 turn atau task selesai | Context Assembly | 7-30 hari |
| **Task Memory** | Per-task (task_memories) | Setiap step + verifier | Hanya jika taskId aktif atau `memory_search` dengan taskId | Lifecycle Task + 7 hari |
| **Long-Term** | Fakta relevan (memories) | Verifier PASS + relevance > threshold + `memory_save` (L2) | Context Assembly (top 3) | Permanen, dapat dihapus user |
| **User Knowledge** | Profil terstruktur (user_knowledge) | `memory_save` type=user_knowledge | Context Assembly | Permanen |

**Aturan:** `memory_save` (L2/MEDIUM) hanya untuk Long-Term/User Knowledge. Task Memory ditulis otomatis oleh Execution Engine, bukan via tool.

---

## 17. Human-in-the-Loop

**Trigger:**
- `Permission Gate → REQUIRES_CONFIRMATION` (HIGH di mode non-Autonomous)
- `Verifier → ASK_USER` (intent ambigu, need clarification)
- `Planner validation FAIL` 2x

**Alur via `ask_user` tool (D03 TOOL-09, L0):**

```
Agent Core → ToolRegistry.execute("ask_user", {question, options, context}, ctx)
  → status: REQUIRES_CONFIRMATION
  → UI: Kartu "Agent ingin menjalankan [file_write HIGH] — Hapus file X? [Approve] [Edit] [Cancel]"
  → User: Approve / Edit (ubah input) / Cancel
  → Resume execution dari step tersebut
```

**Autonomy (D00 Bab 6):**
- `Manual` — semua HIGH butuh approval
- `Assisted` (default MVP) — HIGH butuh approval, LOW/MEDIUM auto
- `Semi-Autonomous` — L3 auto, L4 butuh approval
- `Autonomous` — semua auto (dengan warning log)

---

## 18. Agent State Machine

```
                    ┌──────────┐
                    │  IDLE    │
                    └────┬─────┘
                         │ User Intent
                         ▼
                    ┌──────────┐
                    │OBSERVING │──► Context Assembly
                    └────┬─────┘
                         ▼
                    ┌──────────┐
                    │ PLANNING │──► Planner (LLM) → Plan JSON
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │VALIDATING│──► Plan Validator (rule-based)
                    └────┬─────┘
                         │ valid / invalid (retry 1x)
                         ▼
                    ┌──────────┐
                    │GATING    │──► Permission Gate per-step
                    └────┬─────┘
                         │ allowed / awaiting_approval
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌─────────────────┐   ┌─────────────────┐
     │AWAITING_APPROVAL│   │   EXECUTING     │──► ToolRegistry per step
     └────────┬────────┘   └────────┬────────┘     → Task Memory
              │ user action         │
              └──────────┬──────────┘
                         ▼
                    ┌──────────┐
                    │ VERIFYING│──► Rule + LLM Judge
                    └────┬─────┘
                         │ PASS / RETRY / REPLAN / ASK_USER
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           ┌──────┐ ┌────────┐ ┌──────────┐
           │RETRY │ │ REPLAN │ │ASK_USER  │
           └──┬───┘ └───┬────┘ └────┬─────┘
              │         │           │
              └─────────┴───────────┘
                         │ (max 3 cycles)
                         ▼
                    ┌──────────┐
                    │ REFLECT  │──► Simpan Task/Long-Term, ringkas
                    └────┬─────┘
                         ▼
                    ┌──────────┐
                    │COMPLETED │──► Report ke UI
                    │ / FAILED │
                    │ / BLOCKED│
                    └──────────┘
```

Setiap transisi dicatat sebagai `AgentEvent` untuk observability.

---

## 19. Agent Events & Observability (D00 Bab 16)

**Event wajib:**

```typescript
type AgentEvent =
  | { type:"context_assembled", taskId, toolCount:number, memoryCount:number }
  | { type:"plan_generated", taskId, plan:Plan, validatorResult }
  | { type:"permission_checked", taskId, stepId, permissionLevel, uiLabel, allowed:boolean }
  | { type:"tool_executed", taskId, stepId, toolId, status, durationMs }
  | { type:"verification_result", taskId, status:"PASS"|"FAIL", reason:string }
  | { type:"retry", taskId, attempt:number, strategy:"RETRY"|"REPLAN" }
  | { type:"human_input", taskId, action:"approved"|"edited"|"cancelled" }
  | { type:"task_completed", taskId, finalStatus:"SUCCESS"|"PARTIAL_SUCCESS"|"FAILED"|"BLOCKED" }
```

- Disimpan di `task_memories.steps` + `agent_events` table (InsForge)
- UI: `Thinking → Planning (4 steps, MEDIUM) → Executing 2/4 → Verifying → Done` + expandable log

---

## 20. Safety & Security Constraints (D00 Bab 18)

- **No bypass:** Tidak ada jalur `Agent Core → Tool` tanpa `Validator + Gate + Registry`
- **Input sanitization:** Validator cek `inputSchema` + block `path traversal`, `private IP`, `injection`
- **Least privilege:** Tool hanya akses sesuai schema. `file_read` tidak bisa baca `../../etc/passwd`
- **Secrets:** Tidak ada di Context Packet atau Plan. Model proxy via InsForge Secrets
- **Max steps & max cycles:** Mencegah infinite loop & biaya berlebih

---

## 21. L0–L4 Enforcement Model

```
Planner menghasilkan: step.permissionLevel (informational)
         ↓
Validator cek: cocok dengan registry.get(tool).permissionLevel? → jika tidak, REJECT
         ↓
Gate cek: level + autonomy → ALLOWED / REQUIRES_CONFIRMATION
         ↓
Registry execute → meta.permissionLevel dicatat di log
```

**Enforcement ganda:** Validator + Gate. Planner tidak dapat mengklaim `web_search` sebagai L0 untuk bypass HIGH — akan ditolak validator.

---

## 22. Model Layer Interface (D02 §3.3)

```typescript
interface ModelLayer {
  // Untuk Planner — structured output
  generatePlan(context: ContextPacket): Promise<Plan> // via chat dengan response_format: json_object

  // Untuk Verifier Judge — semantic check
  judgeVerification(step: Step, result: ToolResult): Promise<{pass:boolean, reason:string}>

  // Untuk Understand — intent classification (future)
  classifyIntent(raw: string): Promise<{intent:string, entities:Record<string,string>}>
}

// Seleksi provider via ModelRouter (D02 §3.3) — tidak lock-in
// MVP: 1 provider utama + fallback, temperature 0.2 untuk planner, 0 untuk verifier
```

---

## 23. Structured Output / JSON Contracts

**Semua output LLM di D04 harus JSON valid:**

- `Plan` — validasi dengan `planSchema` (§8.2)
- `JudgeResult` — `{ pass:boolean, reason:string }`
- Tidak ada markdown, tidak ada teks bebas di luar JSON — jika ada, Validator REJECT dan retry

**Guardrail:** Jika LLM mengembalikan teks bebas 2x berturut → fallback ke `ASK_USER`: "Saya butuh klarifikasi — bisakah perjelas tujuan Anda?"

---

## 24. MVP vs Extended Capabilities

| Fitur | MVP (D00 Phase 1-4) | Extended (Phase 5-6) | Catatan |
|-------|---------------------|----------------------|---------|
| **Max steps** | 8 sequential | 16 + DAG preconditions | MVP sequential cukup untuk 8bitAI |
| **Planner** | Single LLM call → 1 Plan | Re-planning + multi-phase | MVP 1 replan max |
| **Verifier** | Rule + LLM Judge sederhana | Multi-step, cross-tool consistency | MVP cukup |
| **Task Memory** | Per-task, TTL 7 hari | Advanced compression, embedding | MVP simpan raw |
| **Tool discovery** | Via registry (9 tools MVP v1) | Puluhan tools, filtering by category | Registry sudah extensible |
| **Autonomy** | Assisted (default) | Semua level | MVP fokus Assisted |
| **Execution** | Sync, sequential | Async, parallel, long-running queue | D02 ADR-05 |

Semua extended tidak mengubah kontrak Plan — hanya menambah `preconditions` DAG dan `parallel` flag di masa depan.

---

## 25. Testing & Evaluation

**Wajib lulus (D00 Bab 25 Definition of Done):**

1. **Contract test:** Planner output → Validator PASS untuk valid plan, REJECT untuk invalid (tool tidak ada, input salah, permission mismatch)
2. **Gate test:** Plan dengan L3 di mode Assisted → `AWAITING_APPROVAL`, di Autonomous → `ALLOWED`
3. **Verifier test:** Step dengan `results.length=0` tapi rule `>=1` → FAIL
4. **Retry test:** TIMEOUT (retryable) → retry 2x → SUCCESS; FILE_NOT_FOUND (non-retryable) → REPLAN
5. **Extensibility test:** Register tool baru `test_tool` → Planner dapat memilihnya tanpa update D04
6. **Isolation test:** Task Memory task A tidak muncul di task B
7. **Safety test:** Planner klaim `permissionLevel:0` untuk `terminal_exec` (seharusnya 3) → Validator REJECT

---

## 26. End-to-End Examples

### Contoh 1 — MVP Sukses Tanpa Approval (LOW/MEDIUM)

**Intent:** "Cari materi Android CLI, rangkum dan simpan sebagai file"

**Context Assembly:** `availableTools = 9 tools MVP v1 (semua L0-L2), autonomy=Assisted`

**Planner Output:**
```json
{
  "version": "1.0",
  "goal": "Cari materi Android CLI, rangkum dan simpan",
  "reasoning": "Butuh search, fetch, lalu simpan ringkasan",
  "steps": [
    { "id":"step-1", "tool":"web_search", "input":{"query":"Android CLI documentation","count":3}, "expectedOutput":"3 hasil relevan", "verification":{"rule":"results.length >= 2","onFail":"REPLAN"}, "permissionLevel":1 },
    { "id":"step-2", "tool":"web_fetch", "input":{"url":"https://developer.android.com/tools/cli"}, "expectedOutput":"Konten CLI terambil, panjang >500", "verification":{"rule":"content.length > 500","onFail":"RETRY"}, "permissionLevel":1 },
    { "id":"step-3", "tool":"file_write", "input":{"path":"rangkuman-android-cli.md","content":"# Rangkuman Android CLI\n..."}, "expectedOutput":"File tertulis bytesWritten>0", "verification":{"rule":"bytesWritten > 0","onFail":"RETRY"}, "permissionLevel":2 },
    { "id":"step-4", "tool":"memory_save", "input":{"content":"User tertarik Android CLI","type":"long_term"}, "expectedOutput":"saved true", "verification":{"rule":"saved == true","onFail":"ASK_USER"}, "permissionLevel":2 }
  ],
  "estimatedRisk": 2,
  "requiresApproval": false
}
```

**Validator:** PASS (semua tool ada, input valid, permission cocok)

**Gate:** Semua L1-L2 → ALLOWED (tidak butuh approval)

**Execution:** `web_search → SUCCESS (2.1s) → web_fetch → SUCCESS (1.2s) → file_write → SUCCESS → memory_save → SUCCESS` — semua disimpan ke Task Memory

**Verifier:** Rule semua PASS → LLM Judge PASS → `SUCCESS` → Reflect → Report "Rangkuman disimpan di rangkuman-android-cli.md"

---

### Contoh 2 — HIGH Memerlukan Approval + Retry

**Intent:** "Buka folder proyek, cek error build, perbaiki jika bisa" (D00 Bab 15)

**Planner Output:**
```json
{
  "version":"1.0",
  "goal":"Diagnosa dan perbaiki error build",
  "steps":[
    { "id":"step-1", "tool":"file_read", "input":{"path":"build.log"}, "expectedOutput":"Log terbaca", "verification":{"rule":"content.length > 0","onFail":"ASK_USER"}, "permissionLevel":1 },
    { "id":"step-2", "tool":"terminal_exec", "input":{"command":"npm run build"}, "expectedOutput":"Build exitCode 0", "verification":{"rule":"exitCode == 0","onFail":"RETRY"}, "permissionLevel":3 },
    { "id":"step-3", "tool":"file_write", "input":{"path":"fix.patch","content":"..."}, "expectedOutput":"Fix tertulis", "verification":{"rule":"bytesWritten > 0","onFail":"RETRY"}, "permissionLevel":2 }
  ],
  "estimatedRisk":3,
  "requiresApproval":true
}
```

**Validator:** PASS — tetapi `terminal_exec` adalah **extended tool** (D03 §4.3). Jika belum aktif di MVP v1, Validator akan REJECT: `Tool terminal_exec not registered` → REPLAN → Planner harus buat plan alternatif tanpa terminal (ex: hanya `file_read` + `ask_user` untuk panduan manual) — membuktikan extensibility.

**Jika extended aktif:**
**Gate:** step-1 L1 → ALLOWED, step-2 L3/HIGH → `AWAITING_APPROVAL` → UI: "Agent ingin menjalankan [terminal_exec HIGH] — Jalankan build? [Approve] [Cancel]" → User Approve → Execute

**Execution:** step-1 SUCCESS → step-2 FAILED (exitCode 1, missing dep, retryable:false) → Verifier FAIL → trigger REPLAN → Planner baru dengan `npm install` step → Gate lagi → Execute → SUCCESS → Verifier PASS

---

## 27. Acceptance Criteria — Definition of Done D04

D04 dianggap DONE jika:

- [ ] Plan Contract (§8) diimplementasikan dengan JSON Schema validation — invalid plan ditolak
- [ ] Planner hanya menghasilkan Structured Plan, tidak mengeksekusi — dibuktikan via test (Planner tidak memanggil ToolRegistry)
- [ ] Tool discovery via `registry.getToolSchemasForLLM()` — menambah tool baru tanpa update Planner code (extensibility test PASS)
- [ ] Permission Gate enforce L0-L4 per-step — HIGH butuh approval di Assisted (gate test PASS)
- [ ] Verifier ada dan dijalankan setiap eksekusi — Rule + LLM Judge, dengan `onFail` strategy
- [ ] Retry/Recovery max 3 cycles, tidak infinite
- [ ] Task Memory terikat taskId, isolasi terbukti, tidak menggantikan User Knowledge
- [ ] Human-in-the-loop via `ask_user` — approval HIGH dan klarifikasi berfungsi
- [ ] Observability events dicatat untuk setiap fase lifecycle
- [ ] Semua §25 tests PASS

> **Prinsip Final D04:** Agent Core adalah **orkestrator deterministik** yang menggunakan LLM sebagai *advisor*, bukan sebagai *actor*. Keamanan, validasi, dan eksekusi selalu di tangan sistem — bukan di tangan model.

**Next:** D05 — Memory System Specification (detail storage, embedding, TTL, CRUD untuk Short/Conversation/Task/Long/User Knowledge) atau D06 — Android Integration, sesuai prioritas Anda. D04 ini sudah cukup sebagai kontrak implementasi MVP tanpa menunggu D05/D06.

