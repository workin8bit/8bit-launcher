# Dokumen 02 — 8bitAI System Architecture
> **Status:** DRAFT v1.1 — ALIGNED (Approved dengan Revisi 12 Sep 2026)
> **Induk:** Dokumen 00 — Master Constitution (FINAL) + Dokumen 01 — Product Vision & Functional Scope (DRAFT v1.0)
> **Tanggal:** 12 September 2026 — Kudus, ID
> **Otoritas:** Hierarki: Dokumen 00 > Dokumen 01 > Dokumen 02 (Bab 10 & 11 Konstitusi). Jika konflik, Dokumen 00 §20 menang.
> **Prinsip:** Tool-First, Modular, Tidak Overengineering, User First
> **Keputusan Resmi:** APPROVED — Penomoran 00→01→02 disahkan, L0-L4 otoritatif, Task Memory terikat Task, InsForge+Vercel untuk MVP, Phase D00 otoritatif

---

### 1. Tujuan Dokumen
Dokumen ini menerjemahkan **Visi (Bab 2)** dan **Target Arsitektur (Bab 4)** dari Konstitusi menjadi arsitektur teknis yang dapat diimplementasikan untuk MVP.

Dokumen ini **TIDAK** membuat konsep baru yang bertentangan dengan Dokumen 00. Semua istilah mengacu pada Bab 5 Konstitusi: `Agent Core`, `Model Layer`, `Tool System`, `Memory System`, `Execution Engine`, `Permission & Safety Layer`.

**Validasi Konstitusi:**
- [x] Lolos Feature Gate (Bab 12) — meningkatkan kemampuan agent, dibutuhkan, sesuai arsitektur, modular, aman, layak untuk Phase 1-2
- [x] Memenuhi MVP Philosophy (Bab 13) — fokus pada Agent Core → Model → Tool → Memory → Execution
- [x] Mematuhi Arena.ai Rule (Bab 22) — Constitution → Architecture → Module Spec → Implementation
- [x] **ALIGNMENT 12 Sep 2026:** Seluruh arsitektur tunduk pada **D00 §20 sebagai SOURCE OF TRUTH** untuk phase. D01 §19 dipetakan sebagai milestone, tidak menggantikan D00.

---

### 2. Arsitektur Konseptual (Refinement dari Bab 4 Konstitusi)

```
                        ┌─────────────────────────┐
                        │          USER           │
                        │  (Human-in-the-Loop)    │
                        └────────────┬────────────┘
                                     │ Natural Language / Voice / Intent
                                     ▼
                        ┌─────────────────────────┐
                        │       8bitAI UI         │  ◄── Bab 14: clean, cepat, minimal
                        │  Android + Capacitor    │      Identitas 8-bit = branding, bukan batasan
                        │  (WebView → Native)     │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │       AGENT CORE        │  ◄── Otak Orkestrasi (Bab 5.1)
                        │  Understand → Plan      │
                        │  Execute → Verify       │
                        │  + Planner + Verifier   │
                        └────────────┬────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌─────────────────┐      ┌───────────────────┐      ┌──────────────────┐
│   TOOL SYSTEM   │      │  MEMORY SYSTEM    │      │   MODEL LAYER    │
│  (Bab 5.3)      │◄────►│   (Bab 5.4)       │◄────►│   (Bab 5.2)      │
│  Registry &     │      │ Short → Conv →    │      │  Provider        │
│  Executor       │      │ Long → User       │      │  Abstraction     │
│  Extensible     │      │ + Task (terikat)  │      │                  │
└────────┬────────┘      └─────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   ▼
                        ┌─────────────────────────┐
                        │   EXECUTION ENGINE      │  ◄── Bab 5.5
                        │  State Machine & Retry  │
                        └────────────┬────────────┘
                                     │
                        ┌─────────────────────────┐
                        │ PERMISSION & SAFETY     │  ◄── Bab 5.6 (L0-L4 otoritatif)
                        │ Gatekeeper semua aksi   │      LOW/MED/HIGH = label UI
                        └────────────┬────────────┘
                                     │
                        ┌─────────────────────────┐
                        │  EXTERNAL SERVICES      │
                        │  InsForge / Vercel /    │
                        │  Web APIs / Android OS  │
                        └─────────────────────────┘
```

**Aliran Utama (Bab 15):**
`Ask → Understand → Plan → Inspect (Tool) → Identify → Propose → [Human Approval L3/L4] → Execute → Verify → Remember → Report`

---

### 3. Layer Breakdown — Spesifikasi Modul

#### 3.1 UI Layer — 8bitAI Android Interface
**Tanggung jawab:** Menampilkan chat, plan, tool calls, dan approval gate. Bukan sekadar chatbot UI.

- **Stack Konstitusi (Bab 9):** `Web Technology (React/Next) → Capacitor → Android Shell` . Tidak membuat native Kotlin dari nol untuk MVP kecuali diperlukan.
- **UX (Bab 14):** Clean, cepat, minimal. Menampilkan status agent: `Thinking → Planning → Executing (3/5) → Verifying → Done`
- **Komponen UI Wajib MVP:**
  1. Chat Stream (user ↔ agent)
  2. Plan Preview Card (langkah-langkah yang akan dieksekusi)
  3. Tool Call Log (collapsible, untuk Observability Bab 16)
  4. Approval Gate (Bab 7): `[Approve] [Edit] [Cancel]` untuk L3/L4 — label UI: **HIGH**
  5. Memory Indicator (apa yang diingat)
- **Anti-Overengineering:** Tidak ada theming engine, animasi berat, atau game-like UI di MVP. Identitas 8-bit hanya di logo/aksen.

#### 3.2 Agent Core — Otak Orkestrasi (Bab 5.1)
**Single Responsibility:** Mengubah Goal → Plan → Execution. Tidak boleh mengandung logika tool atau model secara langsung.

```
Input: User Goal (string + context + memory)
  ↓
[Understand] → Intent Classification + Entity Extraction + Memory Retrieval
  ↓
[Plan] → DAG (Directed Acyclic Graph) of Steps
  ↓
[Execute] → Delegasi ke Execution Engine
  ↓
[Verify] → Cek hasil vs Goal (SUCCESS / PARTIAL / FAILED / BLOCKED)
  ↓
[Respond] → Jawaban + Next Action
```

- **Planner:** LLM-based, tapi output terstruktur (JSON) bukan teks bebas. Harus menghasilkan `Plan { goal, steps[], required_tools[], risk_level }` — `risk_level` menggunakan **L0-L4** (otoritatif)
- **Verifier:** Rule + LLM judge. Membandingkan `Expected Output` vs `Actual Tool Result`.
- **Aturan:** Agent Core tidak boleh memanggil API eksternal langsung. Harus lewat Tool System (Bab 5.3 — Tool-First).

#### 3.3 Model Layer — Abstraksi Provider (Bab 5.2)
**Tujuan:** Agent tidak lock-in ke satu provider (Konstitusi Rule 03 & 5.2).

```typescript
// Kontrak Abstraksi — Tidak boleh diubah tanpa update Dokumen 02
interface AIModelProvider {
  id: string // "openai" | "anthropic" | "google" | "local"
  chat(params: ChatParams): Promise<ChatResult>
  stream(params: ChatParams): AsyncIterable<Chunk>
  supportsTools(): boolean
}

interface ChatParams {
  messages: Message[]
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
}

interface ModelRouter {
  select(modelHint?: string, taskType?: "plan"|"verify"|"chat"): AIModelProvider
  fallback(primary: string): AIModelProvider
}
```

- **MVP:** Implementasi 1 provider utama (misal OpenAI-compatible) + 1 fallback. Struktur router sudah ada agar Phase 6 bisa tambah provider tanpa refactor.
- **Lokasi Kredensial:** Tidak di-hardcode. Lewat InsForge secrets / Vercel Env (Bab 18 Security).

#### 3.4 Tool System — Kemampuan Eksternal (Bab 5.3)
**Ini adalah jantung Level 4 Agent (Bab 1). Tanpa ini, 8bitAI hanya chatbot.**

Setiap Tool WAJIB memiliki kontrak lengkap (Konstitusi Bab 5.3):

```typescript
interface ToolDefinition {
  name: string              // ex: "web_search"
  description: string       // untuk LLM planner
  inputSchema: JSONSchema   // validasi
  outputSchema: JSONSchema
  permissionLevel: 0|1|2|3|4 // Bab 5.6 — OTORITATIF
  riskLabel?: "LOW"|"MEDIUM"|"HIGH" // Label UI turunan dari permissionLevel
  category: "web"|"file"|"android"|"system"|"memory"
  execution: (input, context) => Promise<ToolResult>
}

interface ToolResult {
  status: "SUCCESS"|"FAILED"|"BLOCKED"|"REQUIRES_CONFIRMATION"
  data?: any
  error?: { code: string, message: string, retryable: boolean }
  meta: { durationMs: number, permissionLevel: number }
}
```

**Tool Registry (Modular — Bab 3 Rule 04):**
```
ToolRegistry
 ├── register(tool: ToolDefinition)
 ├── list() → ToolDefinition[]
 ├── get(name) → ToolDefinition
 └── execute(name, input, userContext) → ToolResult (via Permission Gate)
```

**MVP Tool Set v1 — Minimal Viable Agent (EXTENSIBLE, bukan final):**
> **Penting (Keputusan 12 Sep 2026):** Enam tools di bawah adalah **MVP Tool Set v1** — himpunan awal yang membuktikan agent dapat Think-Act-Verify. **Tool System tetap extensible** via `registry.register()` tanpa mengubah Agent Core. Tool lain ditambah di phase berikutnya sesuai Feature Gate.

| Tool | Level Otoritatif | Label UI | Deskripsi | Phase D00 |
|------|-----------------|----------|-----------|-----------|
| `web_search` | L1 Read-only | LOW | Cari web (read-only) | Phase 4 — Tools |
| `web_fetch` | L1 Read-only | LOW | Ambil konten URL | Phase 4 — Tools |
| `file_read` | L1 Read-only | LOW | Baca file workspace | Phase 4 — Tools |
| `file_write` | L2 Low-risk | MEDIUM | Tulis file (workspace, undoable) | Phase 4 — Tools |
| `android_app_launch` | L1 Read-only | LOW | Buka aplikasi via Intent | Phase 4 — Tools |
| `device_info` | L0 Informasi | LOW | Info perangkat | Phase 4 — Tools |
| `memory_search` | L1 Read-only | LOW | Cari memory pengguna | Phase 3 — Memory |
| `memory_save` | L2 Low-risk | MEDIUM | Simpan ke long-term memory | Phase 3 — Memory |
| `ask_user` | L0 Informasi | LOW | Minta konfirmasi/edit | Phase 2 — Agent Core |

*Catatan: `terminal_exec` dan `android_intent` (side-effect) tetap di Tool System sebagai tool L3, tetapi **tidak termasuk MVP Tool Set v1**. Mereka masuk **Phase 4 extended / Phase 5** setelah approval gate stabil, sesuai prinsip MVP-first.*

**Non-MVP (Ditunda — Anti Overengineering Bab 3 Rule 05):** `browser_tool` lanjutan, `automation_tool` kompleks, `calendar_tool`, `database_tool` — masuk Phase 6 Intelligence Expansion via Feature Gate.

**Prinsip Extensibility:**
```typescript
// Menambah tool baru TIDAK mengubah Agent Core
registry.register({
  name: "calendar_create",
  description: "Buat event kalender",
  permissionLevel: 3, // HIGH di UI
  inputSchema: { ... },
  execution: async (input) => { ... }
})
```

#### 3.5 Memory System — Konteks Bertingkat (Bab 5.4 + Alignment 12 Sep 2026)
**Bukan menyimpan semua chat otomatis (Konstitusi Bab 5.4). Harus ada aturan relevansi.**

```
User Input
   ↓
[Short-Term Context] — 10-20 pesan terakhir, di RAM, hilang saat restart
   ↓ (ringkas jika relevan)
[Conversation Memory] — Ringkasan percakapan, disimpan di InsForge DB, TTL 7-30 hari
   ↓ (ekstrak jika penting) 
        \
         +→ [Task Memory] — TERIKAT lifecycle/context suatu Task (APPROVED definisi)
         |    { taskId, goal, steps, results, status } — TTL = lifecycle Task
         |    BUKAN menggantikan User Knowledge. Hanya untuk Task System (D01 Bab 13)
         ↓
[Long-Term Memory] — Fakta preferensi, disimpan permanen, butuh persetujuan implisit
   ↓ (distilasi)
[User Knowledge] — Profil terstruktur: { name, preferences, projects, goals } — TETAP ADA
```

**Definisi Resmi (Keputusan 12 Sep 2026 — Poin #3):**
- **Task Memory** = memory yang terikat lifecycle/context suatu **Task** (`Planning → Running → Waiting → Completed` - D01 Bab 13). Berisi goal, steps, tool results spesifik task tersebut. Dihapus/diarsip saat task selesai sesuai retention policy.
- **Conversation Memory** = ringkasan percakapan umum, tidak terikat task spesifik.
- **Long-Term Memory** + **User Knowledge** = tetap sebagai penyimpanan permanen lintas-task, tidak digantikan oleh Task Memory.

**Aturan Implementasi (Bab 5.4 + Bab 19):**
- `relevance` → Hanya simpan jika skor relevansi > threshold (LLM judge)
- `persistence` → User bisa `View / Export / Delete / Clear` untuk semua layer (Bab 19) — termasuk `Clear Task Memory` per-task
- `security` → Memory terenkripsi per-user, tidak cross-user. Task Memory terisolasi per-taskId
- `control` → UI toggle: “Ingat ini” / “Lupakan” + “Hapus memory task ini”
- **Storage MVP:** InsForge Database (Bab 9) — tabel:
  - `memories { id, user_id, type: 'conversation'|'long_term', content, embedding, created_at }`
  - `user_knowledge { user_id, key, value, updated_at }`
  - `task_memories { task_id, user_id, content, created_at, expires_at }` — terikat Task System

#### 3.6 Execution Engine — Mesin Eksekusi (Bab 5.5)
Menjalankan DAG Plan secara deterministik. Berbeda dengan Agent Core yang bersifat reasoning.

**State Machine (Bab 17 Error Handling):**
```
  ┌──────┐
  │ PENDING ──► PLANNING ──► AWAITING_APPROVAL ──┐
  └──────┘                                      │
        ▲                                       ▼
        │                              ┌────────────────┐
        │                              │   EXECUTING    │
        │                              │ Step 1 → Tool  │
        │                              │ Step 2 → Tool  │
        │                              └───────┬────────┘
        │                                      │
        │         ┌────────────────────────────┼────────────────────────────┐
        │         ▼                            ▼                            ▼
  ┌──────────┐ ┌──────────┐          ┌─────────────────┐          ┌──────────────┐
  │ RETRYING │ │ VERIFYING│          │REQUIRES_CONFIRM │          │   FAILED     │
  │(max 2x)  │ │          │          │   (L3/L4)       │          │  → Diagnose  │
  └────┬─────┘ └────┬─────┘          └─────────────────┘          └──────┬───────┘
       │            │                                                     │
       └────────────┼─────────────────────────────────────────────────────┘
                    ▼
             ┌─────────────┐
             │  SUCCESS /  │
             │PARTIAL_SUCC.│ → Remember → Report (simpan ke Task Memory + Long-Term jika relevan)
             └─────────────┘
```

- **Retry Policy:** Hanya untuk error `retryable=true` dan Level ≤3. Max 2x. L4 tidak auto-retry.
- **Long-running:** Untuk MVP, eksekusi sinkron. Phase 5 (Autonomous Workflow) baru tambahkan job queue untuk long-running tasks.
- **Observability:** Setiap step log: `{ stepId, tool, input, output, status, duration, timestamp }` — disimpan di Task Memory

#### 3.7 Permission & Safety Layer — Gatekeeper (Bab 5.6 + 18 + Alignment 12 Sep 2026)
**Semua Tool Call wajib lewat layer ini. Tidak ada bypass. Hierarki: L0-L4 otoritatif, LOW/MED/HIGH hanya label UI.**

| Level Otoritatif (Teknis) | Label UI (Abstraksi) | Contoh MVP Tool Set v1 | Gate |
|---------------------------|----------------------|------------------------|------|
| **L0 Informasi** | LOW | `ask_user`, `device_info`, `memory_search` | Langsung |
| **L1 Read-only** | LOW | `web_search`, `file_read`, `web_fetch`, `android_app_launch` | Langsung, log |
| **L2 Low-risk** | MEDIUM | `file_write` (workspace), `memory_save` | Langsung, tapi undoable + log |
| **L3 External side effect** | HIGH | `terminal_exec`, `android_intent` (share/kirim) — *extended* | **Butuh Approval** `Approve/Cancel/Edit` |
| **L4 Sensitive / irreversible** | HIGH | `file_write` (hapus), `terminal_exec` (rm -rf), transaksi | **Butuh Explicit Confirm** + warning merah |

**Pemetaan Resmi (Keputusan Poin #2):**
```
LOW    = L0 + L1  (informasi & read-only)
MEDIUM = L2       (low-risk, reversible)
HIGH   = L3 + L4  (side effect & irreversible)
```
Dokumen teknis, kode, dan log **WAJIB** menggunakan L0-L4. UI boleh menampilkan LOW/MEDIUM/HIGH untuk kesederhanaan user.

Implementasi:
```typescript
function canExecute(tool: ToolDefinition, userAutonomy: AutonomyLevel): GateResult {
  // Autonomy: Manual → Assisted → Semi-Auto → Autonomous (Bab 6 Konstitusi)
  // L0-L2: selalu boleh sesuai autonomy
  // L3-L4: butuh approval kecuali Autonomous
  if (tool.permissionLevel >= 3 && userAutonomy !== "Autonomous") {
    return { allowed: false, requires: "USER_APPROVAL", uiLabel: "HIGH" }
  }
  return { allowed: true, uiLabel: tool.permissionLevel <=1 ? "LOW" : "MEDIUM" }
}
```

---

### 4. Data Flow — End-to-End Sequence

**Contoh Konstitusi Bab 15:** *“Buka folder proyek saya, cek error build terakhir, lalu perbaiki kalau memungkinkan.”*

```
1. USER: "cek error build terakhir..."
   → UI → Agent Core (Understand) → Ambil Memory (project path dari User Knowledge) + Context (Short-Term)
2. Agent Core (Plan):
   Plan = {
     goal: "diagnose & fix build",
     steps: [
       { id:1, tool:"file_read", input:{path:"build.log"}, risk:1, uiLabel:"LOW" },
       { id:2, tool:"terminal_exec", input:{cmd:"npm run build"}, risk:3, uiLabel:"HIGH" }, // extended tool
       { id:3, tool:"file_write", input:{path:"...fix..."}, risk:2, uiLabel:"MEDIUM" }
     ]
   }
3. Permission Layer: Step 1 (L1/LOW) → auto, Step 2 (L3/HIGH) → tampilkan Approval Card
4. USER: [Approve]
5. Execution Engine: Jalankan Step 1 → SUCCESS → Step 2 → FAILED (missing dep)
                              → Verifier: Diagnose → Retry dengan `npm install`
                              → Step 2 retry → SUCCESS → Step 3
6. Memory: Simpan ke Task Memory (taskId=123) + jika relevan → Long-Term "project X build fixed via npm install"
7. Agent Core (Report): "Build error karena dep hilang, sudah diperbaiki. Test passed."
```

---

### 5. Backend & Infrastructure Mapping (Bab 9 Konstitusi + Keputusan Poin #4)

**Prinsip MVP: Sederhana, Jangan Microservices Terlalu Dini (Bab 3 Rule 05)**
**Keputusan 12 Sep 2026:** Tetap **InsForge + Vercel** sebagai implementasi MVP dari prinsip *Local-first where practical, cloud-enabled where useful* (D01 Bab 18).

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (Android)                          │
│  Capacitor Shell → WebView (React/Next.js) → Agent UI            │
│  Local Storage (Short-Term + cache)                             │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS / WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND (InsForge) — SOURCE OF TRUTH         │
│  • Auth (InsForge Auth)                                          │
│  • Database (memories, task_memories, tasks, logs, user_knowledge) │
│  • Tool Executor (proxy untuk web_search, file, terminal*)      │
│  • Model Proxy (menyembunyikan API key, rate limit)             │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   DEPLOYMENT (Vercel)                            │
│  • Next.js API Routes (/api/agent/*)                            │
│  • Serverless Functions untuk Agent Core & Execution            │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    EXTERNAL PROVIDERS                            │
│  • AI Provider (OpenAI/Anthropic)                               │
│  • Web Search API                                                │
└──────────────────────────────────────────────────────────────────┘

* terminal_exec di MVP berjalan di sandbox Vercel/InsForge, bukan di device Android langsung (keamanan Bab 18)
  Phase 4 Tools (D00) baru eksekusi on-device via Capacitor Plugin untuk Android Integration

Local-first interpretation:
- Short-Term & Task Memory: cache lokal + sync ke InsForge
- Long-Term & User Knowledge: di InsForge (cloud-enabled), tapi dapat di-export/clear lokal (Bab 19)
- Secrets: di InsForge Secrets / Vercel Env, tidak di device
```

**Repository (Bab 21):**
```
GitHub: 8bitAI — source of truth kode (D01 Bab 18)
├── main (protected, deploy ke Vercel)
├── development (integrasi harian)
├── feature/agent-core
├── feature/tool-system
└── fix/permission-gate
```

---

### 6. Modularitas & Dependency Rules (Bab 3 Rule 04)

**Aturan Keras:**
1. `UI` → boleh panggil `Agent Core`, tidak boleh langsung panggil `Tool` atau `Model`
2. `Agent Core` → boleh panggil `Model Layer`, `Memory`, `Execution Engine`, tidak boleh panggil `External Services` langsung
3. `Execution Engine` → satu-satunya yang boleh panggil `Tool System` + `Permission Layer`
4. `Tool System` → tidak boleh panggil `Agent Core` (cegah circular)
5. Semua modul komunikasi via **interface**, bukan implementasi langsung

**Keuntungan:** Tool baru (misal `calendar_tool` di Phase 6) bisa ditambah dengan `registry.register()` tanpa ubah Agent Core (Bab 5.3 + extensible).

---

### 7. Observability & Error Handling (Bab 16 & 17)

**Log Wajib per Task (disimpan di Task Memory + persistent log):**
```json
{
  "taskId": "uuid",
  "goal": "cek error build",
  "plan": { "steps": [...] },
  "execution": [
    { "step":1, "tool":"file_read", "permissionLevel":1, "uiLabel":"LOW", "status":"SUCCESS", "duration":120 },
    { "step":2, "tool":"terminal_exec", "permissionLevel":3, "uiLabel":"HIGH", "status":"FAILED", "error":"ENOENT", "retry":1 },
    { "step":2, "tool":"terminal_exec", "status":"SUCCESS", "retry":2 }
  ],
  "verification": "SUCCESS",
  "finalResult": "Build fixed"
}
```

UI hanya tampilkan ringkas: `Executing 2/3 → Retrying → Done` + badge `LOW/MED/HIGH`. Detail lengkap (L0-L4) di “View Logs” untuk debugging.

**Status (Bab 17):** `SUCCESS` / `PARTIAL_SUCCESS` / `FAILED` / `BLOCKED` / `REQUIRES_CONFIRMATION` — Agent tidak boleh pura-pura berhasil.

---

### 8. Security & Data Ownership (Bab 18 & 19)

- **Least Privilege (Bab 18):** Tool hanya dapat akses yang dideklarasikan di `inputSchema`. Tidak ada `*` permission. Level teknis L0-L4 enforce di backend.
- **Secrets:** API keys di InsForge Secrets / Vercel Env, tidak di repo, tidak di localStorage.
- **Data Ownership:** Endpoint wajib: `GET /api/user/data` (View), `GET /export` (Export), `DELETE /api/user/data` (Delete), `POST /clear-memory` (termasuk `task_memories`).
- **Android Permissions:** Minta permission hanya saat Tool butuh (misal `android_app_launch` minta permission saat dibutuhkan, bukan saat install).

---

### 9. Phase Mapping — Hierarki Resmi (D00 §20 = SOURCE OF TRUTH)

> **⚠️ KOREKSI PENTING 12 Sep 2026 — Sesuai Keputusan:** D00 §20 tetap otoritatif untuk 6 PHASE RESMI. D01 §19 **tidak menggantikan** D00, melainkan **dipetakan sebagai milestone** di dalam phase D00. Urutan milestone resmi tetap mengikuti D00.

| Phase Resmi (D00 §20) | Tujuan Konstitusi | Isi D00 | Pemetaan D01 §19 (Milestone) | Scope Arsitektur Dok 02 |
|-----------------------|-------------------|---------|-------------------------------|-------------------------|
| **Phase 1 — Foundation** | Repository, Android shell, Backend, Model connection, Basic UI | Repo, Android shell, Backend, Model, Basic UI | D01 P1: project, architecture, UI, configuration, AI provider | ✅ Setup Capacitor + InsForge + Vercel + Model Layer (1 provider) + Chat UI sederhana. **Sumber:** D00 + D01 P1 |
| **Phase 2 — Agent Core** | Agent, Planner, Execution, Tool registry | Agent, Planner, Execution, Tool registry | D01 P2: agent loop, tool registry, tool execution | ✅ Agent Core + Planner (JSON, L0-L4) + Execution Engine (sync) + ToolRegistry (extensible) + Permission Gate L0-L2 + `ask_user` |
| **Phase 3 — Memory** | Conversation, Persistent memory, User context | Conversation, Persistent, User context | D01 P4: memory, task manager, execution history | ✅ Memory System lengkap: Short-Term + Conversation + Long-Term + User Knowledge + **Task Memory (terikat Task)** + `memory_search/save` + Task System (Planning→Completed) |
| **Phase 4 — Tools** | Web, Files, Android, Automation, External APIs | Web, Files, Android, Automation | D01 P3: Android integration, permissions, app launching + D01 P5 sebagian | ✅ **MVP Tool Set v1** (6 tools inti) + extended tools (terminal, android_intent) sebagai Tools Phase 4 lanjutan. Android Integration via Capacitor Plugin |
| **Phase 5 — Autonomous Workflow** | Planning, Execution, Verification, Retry, Long-running tasks | Planning, Execution, Verification, Retry, Long-running | D01 P5: scheduled tasks, workflows, background execution + D01 P6 sebagian | ✅ Verifier + Retry (max 2) + Approval Gate L3/L4 (HIGH) + long-running job queue + scheduled tasks |
| **Phase 6 — Intelligence Expansion** | Kemampuan agent diperluas berdasarkan kebutuhan nyata | Perluas kemampuan | D01 P6: long-running, planning, recovery, multi-agent, advanced memory, remote access | ❌ Ditunda — semua ekspansi via Feature Gate (Bab 12). Tidak di MVP |

**Dependensi Internal yang Diperbolehkan (tidak mengubah milestone resmi):**
```
Foundation
   ↓
Agent Core (Phase 2)
   ↓
Memory / Context (Phase 3) ← Task Memory terikat di sini
   ↓
Tool System (Phase 4) ← MVP Tool Set v1 + extensible registry
   ↓
Android Integration (Phase 4 extended)
   ↓
Task / Automation (Phase 5)
   ↓
Advanced Agent (Phase 6)
```
Urutan di atas adalah **dependensi teknis**, bukan perubahan phase resmi. Milestone tetap lapor per D00 §20.

**Definition of Done per Fitur (Bab 25):** `Spec → Implementation → Integration → Testing → Error Handling → Security Check → Documentation → Done`

---

### 10. Non-Goals — Yang SENGAJA Tidak Dibuat di MVP (Bab 3 Rule 05 & Bab 13)

- ❌ Microservices, message queue (RabbitMQ/Kafka)
- ❌ Multi-agent collaboration
- ❌ Vector DB kompleks (cukup InsForge + embedding sederhana)
- ❌ UI theme engine / animasi 8-bit berat
- ❌ On-device LLM (semua via Model Layer proxy)
- ❌ Automation Tool yang bisa kontrol aplikasi lain tanpa batas
- ❌ Mengunci Tool System hanya pada 6 tools — **Tool System harus tetap extensible** (Keputusan 12 Sep)

Jika ada yang mengusulkan ini di MVP, jawab dengan **Feature Gate Bab 12**: “Apakah ini membuat agent lebih mampu menyelesaikan pekerjaan *sekarang*?” Jika tidak, tunda.

---

### 11. Kontrak Antar Modul — Untuk Module Spec Berikutnya

Dokumen selanjutnya yang harus dibuat (urutan Arena.ai Rule Bab 22 + hierarki D00):

1. **Dokumen 03 — Tool System Specification** — Detail kontrak Tool System yang extensible + MVP Tool Set v1 (input/output schema, L0-L4, error handling, registry). **Bukan mengunci 6 tools sebagai final.**
2. **Dokumen 04 — Agent Core & Planner Specification** (prompt, JSON schema Plan, verifier logic, integrasi Task Memory)
3. **Dokumen 05 — Memory System Specification** (embedding, relevansi, CRUD untuk Short/Conversation/Task/Long/UserKnowledge)
4. **Dokumen 06 — Android Integration Specification** (Capacitor plugins, permissions, app launch)

Semua dokumen tersebut **harus** referensi ke Dokumen 02 ini, Dokumen 01, dan Dokumen 00. Jika konflik, **Dokumen 00 menang**.

---

### 12. Keputusan Arsitektur Penting (ADR Ringkas — Updated)

| ADR | Keputusan | Alasan Konstitusi + Alignment 12 Sep |
|-----|-----------|--------------------------------------|
| ADR-01 | Capacitor > Native Kotlin untuk MVP | Bab 9: Web → Capacitor → Android, lebih cepat, modular |
| ADR-02 | InsForge + Vercel sebagai backend MVP | Bab 9 + Keputusan P4: single backend, local-first where practical |
| ADR-03 | Model Layer abstraction sejak hari 1 | Bab 5.2: jangan lock-in provider |
| ADR-04 | Tool Registry extensible + MVP Tool Set v1 | Bab 5.3 + Rule 04 + Keputusan P3: modular, tidak mengunci 6 tools |
| ADR-05 | Execution sync di MVP, async di Phase 5 | Bab 13: MVP terkecil yang bisa Think-Act-Verify (D00 P5) |
| ADR-06 | Permission Gate di Execution Engine (L0-L4 otoritatif, LOW/MED/HIGH UI) | Bab 5.6 + 18 + Keputusan P2 |
| ADR-07 | Task Memory terikat Task lifecycle, bukan pengganti User Knowledge | Keputusan P3 + D00 Bab 5.4 + D01 Bab 12/13 |
| ADR-08 | Phase D00 §20 otoritatif, D01 §19 sebagai milestone mapping | Keputusan Phase Order 12 Sep — hierarki Dokumen |

---

> **Prinsip Final (Bab 28):** *Build the smallest system that can think, act, verify, and learn — then expand it carefully.*
> Dokumen 02 v1.1 ini adalah sistem terkecil tersebut — sudah selaras dengan keputusan resmi 12 Sep 2026. Tidak lebih, tidak kurang.

**Next Step:** Review Dokumen 02 v1.1 → Jika approved, lanjut ke **Dokumen 03 — Tool System Specification** (spesifikasi extensible + MVP Tool Set v1).

