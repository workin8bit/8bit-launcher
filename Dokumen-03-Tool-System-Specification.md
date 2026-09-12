# Dokumen 03 — 8bitAI Tool System Specification
> **Status:** DRAFT v1.0 — Menunggu Review
> **Induk:** Dokumen 00 — Master Constitution (FINAL) + Dokumen 01 — Product Vision & Functional Scope + Dokumen 02 — System Architecture v1.1 (ALIGNED)
> **Tanggal:** 12 September 2026 — Kudus, ID
> **Otoritas:** Hierarki D00 > D01 > D02 > D03. Jika konflik, D00 menang. Phase mengacu D00 §20.
> **Tujuan:** Menspesifikasikan Tool System yang **extensible** dan **MVP Tool Set v1** — fondasi Level 4 Agent (D00 Bab 1, D02 §3.4)

---

### 1. Tujuan Dokumen

Dokumen ini memperinci **Tool System** — jantung kemampuan 8bitAI sebagai Agent Level 4 (D00 Bab 1 & 5.3, D01 Bab 8, D02 §3.4).

Tool System memungkinkan: `Agent Core → memilih tool → Execution Engine → Permission Check (L0-L4) → eksekusi → Verify → Report` tanpa Agent Core mengetahui detail implementasi tool (D01 Bab 21 Architectural Rule).

**Prinsip turunan yang wajib dipatuhi:**
- **Tool-First (D00 Rule 03):** Jika butuh web/file/Android, harus via Tool, tidak di-hardcode di model
- **Modular (D00 Rule 04):** Tool dapat ditambah/dihapus/diuji tanpa merusak sistem
- **Least Privilege (D00 Bab 18):** Tool hanya dapat akses sesuai `inputSchema` & `permissionLevel`
- **Extensible, tidak terkunci (Keputusan 12 Sep 2026):** MVP Tool Set v1 ≠ seluruh Tool System. Registry dapat menerima tool baru kapan pun via Feature Gate (D00 Bab 12)

**Validasi:**
- [x] Lolos Feature Gate — meningkatkan kemampuan agent, dibutuhkan, modular, aman, layak Phase 2-4 (D00 §20)
- [x] Mematuhi Architectural Rule D01 Bab 21 — Core hanya tahu ID/Description/Schema/Permission/Risk

---

### 2. Kontrak Tool — Source of Truth

#### 2.1 Interface `ToolDefinition` (Otoritatif)

```typescript
// KONSTITUSI Bab 5.3 + Alignment 12 Sep 2026 (L0-L4 otoritatif, LOW/MED/HIGH label UI)
interface ToolDefinition {
  // Identitas
  id: string                    // unik, snake_case, ex: "web_search"
  name: string                  // display name, ex: "Web Search"
  description: string           // untuk LLM planner — harus jelas kapan dipakai
  category: "web"|"file"|"android"|"memory"|"system"|"automation"
  
  // Kontrak I/O — WAJIB JSON Schema (validasi runtime)
  inputSchema: JSONSchema        // Draft 2020-12
  outputSchema: JSONSchema
  
  // Permission & Safety — Otoritatif L0-L4 (D00 Bab 5.6), label UI turunan
  permissionLevel: 0|1|2|3|4
  riskLabel: "LOW"|"MEDIUM"|"HIGH" // derived: LOW=L0+L1, MEDIUM=L2, HIGH=L3+L4
  requiresConfirmation: boolean   // true jika L3/L4
  
  // Eksekusi
  execute: (input: any, context: ToolContext) => Promise<ToolResult>
  // Metadata
  version: string               // semver, ex: "1.0.0"
  phase: "1"|"2"|"3"|"4"|"5"|"6" // Phase D00 §20 tempat tool diperkenalkan
  status: "mvp_v1"|"extended"|"planned"|"deprecated"
}

interface ToolContext {
  userId: string
  taskId: string                // untuk Task Memory binding
  autonomyLevel: "Manual"|"Assisted"|"Semi-Autonomous"|"Autonomous" // D00 Bab 6
  deviceId?: string
}

interface ToolResult {
  status: "SUCCESS"|"FAILED"|"BLOCKED"|"REQUIRES_CONFIRMATION"
  data?: any                    // sesuai outputSchema jika SUCCESS
  error?: {
    code: string                // ex: "FILE_NOT_FOUND", "PERMISSION_DENIED", "TIMEOUT"
    message: string             // human-readable, untuk Verifier & UI
    retryable: boolean          // untuk Execution Engine retry policy
    details?: any
  }
  meta: {
    toolId: string
    permissionLevel: 0|1|2|3|4
    riskLabel: "LOW"|"MEDIUM"|"HIGH"
    durationMs: number
    timestamp: string           // ISO8601
  }
}
```

**Aturan validasi kontrak:**
1. `inputSchema` & `outputSchema` **wajib** ada. Tidak ada tool tanpa schema.
2. `permissionLevel` **wajib** L0-L4. `riskLabel` auto-derived, tidak boleh di-set manual berbeda.
3. `description` harus mengandung: kapan dipakai + kapan **jangan** dipakai + contoh input — untuk akurasi planner LLM.
4. Semua tool **wajib** melewati `Permission Gate` — tidak ada bypass (D00 Bab 5.6, D02 §3.7).

#### 2.2 Pemetaan Permission — Otoritatif

| L (Teknis) | Label UI | Makna D00 Bab 5.6 | Gate di Execution Engine | Contoh Tool |
|------------|----------|-------------------|--------------------------|-------------|
| **L0** | LOW | Informasi | Langsung, log | `ask_user`, `device_info` (read) |
| **L1** | LOW | Read-only | Langsung, log | `web_search`, `web_fetch`, `file_read`, `memory_search`, `android_app_launch` |
| **L2** | MEDIUM | Low-risk, reversible | Langsung, undoable, log | `file_write` (workspace), `memory_save` |
| **L3** | HIGH | External side effect | **REQUIRES_CONFIRMATION** → UI `[Approve/Edit/Cancel]` | `terminal_exec`, `android_intent` (kirim/share) — *extended* |
| **L4** | HIGH | Sensitive / irreversible | **REQUIRES_EXPLICIT_CONFIRM** + warning merah | `file_write` (delete), `terminal_exec` (rm -rf) — *guarded* |

> **Keputusan 12 Sep Poin #2:** Kode, log, dan API **wajib** pakai L0-L4. UI boleh tampilkan LOW/MEDIUM/HIGH.

---

### 3. Tool Registry — Jantung Modularitas

#### 3.1 Arsitektur Registry

```
                ┌─────────────────────────────────┐
                │         AGENT CORE (Planner)    │
                │  "Butuh cari web & buka file"   │
                └──────────────┬──────────────────┘
                               │ list() → deskripsi tools
                               ▼
                ┌─────────────────────────────────┐
                │        TOOL REGISTRY            │  ◄── Singleton, extensible
                │  Map<id, ToolDefinition>        │
                │  register / get / list /        │
                │  execute (via Permission Gate)  │
                └──────────────┬──────────────────┘
                               │ execute(id, input, context)
                               ▼
                ┌─────────────────────────────────┐
                │      PERMISSION GATE            │  ◄── D00 Bab 5.6 + D02 §3.7
                │  canExecute(level, autonomy)    │
                │  → BLOCKED / REQUIRES_CONFIRM   │
                └──────────────┬──────────────────┘
                               │ jika allowed
                               ▼
                ┌─────────────────────────────────┐
                │      TOOL EXECUTOR              │
                │  validate inputSchema           │
                │  → run execute()                │
                │  → validate outputSchema        │
                │  → return ToolResult            │
                └─────────────────────────────────┘
```

#### 3.2 Interface Registry

```typescript
class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    // Validasi: id unik, schema valid, permission L0-L4, description tidak kosong
    if (this.tools.has(tool.id)) throw new Error(`Duplicate tool id: ${tool.id}`)
    this.validate(tool)
    // Auto-derive riskLabel dari permissionLevel
    tool.riskLabel = tool.permissionLevel <=1 ? "LOW" : tool.permissionLevel ===2 ? "MEDIUM" : "HIGH"
    tool.requiresConfirmation = tool.permissionLevel >= 3
    this.tools.set(tool.id, tool)
  }

  get(id: string): ToolDefinition | undefined
  list(filter?: { category?: string, status?: string }): ToolDefinition[]
  
  // SATU-SATUNYA cara eksekusi — wajib lewat gate
  async execute(id: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.get(id)
    if (!tool) return { status:"FAILED", error:{code:"TOOL_NOT_FOUND", message:`Tool ${id} not found`, retryable:false}, meta:{...} }
    
    // 1. Permission Gate
    const gate = this.permissionGate.canExecute(tool.permissionLevel, context.autonomyLevel)
    if (!gate.allowed) return { status: gate.requires === "USER_APPROVAL" ? "REQUIRES_CONFIRMATION" : "BLOCKED", ... }

    // 2. Validate input
    const valid = this.validator.validate(tool.inputSchema, input)
    if (!valid) return { status:"FAILED", error:{code:"INVALID_INPUT", message:valid.errors, retryable:false}, ... }

    // 3. Execute + timeout + validate output
    const start = Date.now()
    try {
      const raw = await this.withTimeout(tool.execute(input, context), 15000)
      this.validator.validateOrThrow(tool.outputSchema, raw)
      return { status:"SUCCESS", data: raw, meta:{ toolId:id, permissionLevel:tool.permissionLevel, riskLabel:tool.riskLabel, durationMs: Date.now()-start, timestamp: new Date().toISOString() } }
    } catch (e) {
      return { status:"FAILED", error:{code:e.code||"EXECUTION_FAILED", message:e.message, retryable:e.retryable??false}, meta:{...} }
    }
  }

  // Untuk LLM planner — hanya kirim id, description, inputSchema (tanpa execute)
  getToolSchemasForLLM(): Array<{id, description, inputSchema, permissionLevel}> {
    return this.list().map(t => ({ id:t.id, description:t.description, inputSchema:t.inputSchema, permissionLevel:t.permissionLevel }))
  }
}
```

**Keuntungan (D00 Rule 04 Modular):** Menambah tool baru = `registry.register(newTool)` — **tanpa** mengubah Agent Core, Planner, atau Execution Engine (D01 Bab 21).

---

### 4. MVP Tool Set v1 — Spesifikasi Lengkap (Extensible)

> **Definisi (Keputusan 12 Sep):** MVP Tool Set v1 adalah **himpunan awal** yang membuktikan agent dapat `Understand → Plan → Act → Verify`. Bukan batasan arsitektur. Tool System dirancang untuk menampung puluhan tool di Phase 5-6 via `register()`.

#### 4.1 Ringkasan MVP Tool Set v1

| # | Tool ID | Kategori | Level | Label UI | Phase D00 | Status | Tujuan MVP |
|---|---------|----------|-------|----------|-----------|--------|------------|
| 1 | `web_search` | web | L1 | LOW | Phase 4 — Tools | **mvp_v1** | Cari informasi web (read-only) |
| 2 | `web_fetch` | web | L1 | LOW | Phase 4 — Tools | **mvp_v1** | Ambil konten URL untuk dirangkum |
| 3 | `file_read` | file | L1 | LOW | Phase 4 — Tools | **mvp_v1** | Baca file workspace |
| 4 | `file_write` | file | L2 | MEDIUM | Phase 4 — Tools | **mvp_v1** | Buat/tulis file (reversible) |
| 5 | `android_app_launch` | android | L1 | LOW | Phase 4 — Tools | **mvp_v1** | Buka aplikasi via Intent |
| 6 | `device_info` | android | L0 | LOW | Phase 4 — Tools | **mvp_v1** | Info perangkat (read-only) |
| 7 | `memory_search` | memory | L1 | LOW | Phase 3 — Memory | **mvp_v1** | Cari memory & Task Memory |
| 8 | `memory_save` | memory | L2 | MEDIUM | Phase 3 — Memory | **mvp_v1** | Simpan ke Long-Term / User Knowledge |
| 9 | `ask_user` | system | L0 | LOW | Phase 2 — Agent Core | **mvp_v1** | Minta konfirmasi/klarifikasi |

*Total: 9 tools — 6 inti + 2 memory + 1 system. Semua L0-L2 (tidak butuh approval HIGH), sehingga MVP dapat berjalan di mode Assisted tanpa friction.*

---

#### 4.2 Spesifikasi Per Tool

##### TOOL-01: `web_search` — L1 / LOW

**Deskripsi untuk Planner:**
> Cari web untuk informasi terkini. Gunakan untuk pertanyaan yang butuh data terbaru, dokumentasi, atau riset awal. JANGAN gunakan untuk info yang sudah ada di memory. Selalu diikuti `web_fetch` untuk detail.

```json
{
  "id": "web_search",
  "name": "Web Search",
  "description": "Search the web for current information. Use for recent docs, news, or research. Follow with web_fetch for details.",
  "category": "web",
  "permissionLevel": 1,
  "phase": "4",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "required": ["query"],
    "properties": {
      "query": { "type": "string", "minLength": 2, "maxLength": 300, "description": "Kata kunci pencarian, spesifik, bahasa pengguna" },
      "count": { "type": "integer", "minimum": 1, "maximum": 5, "default": 3, "description": "Jumlah hasil (1-5)" }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["results"],
    "properties": {
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["title","url","snippet"],
          "properties": {
            "title": { "type": "string" },
            "url": { "type": "string", "format": "uri" },
            "snippet": { "type": "string" }
          }
        }
      },
      "query": { "type": "string" }
    }
  }
}
```

**Contoh:**
- Input: `{ "query": "Android CLI documentation", "count": 3 }`
- Output: `{ "results": [{ "title":"Android CLI — developer.android.com","url":"https://...","snippet":"..."}], "query":"Android CLI documentation" }`
- Error: `TIMEOUT` (retryable:true), `INVALID_INPUT` (retryable:false)

**Implementasi MVP:** Proxy via InsForge → Web Search API (Brave/Tavily). Tidak panggil langsung dari device (keamanan).

---

##### TOOL-02: `web_fetch` — L1 / LOW

**Deskripsi:** Ambil dan ekstrak konten teks dari URL. Gunakan setelah `web_search` untuk mendapatkan detail. Hanya untuk URL http/https publik.

```json
{
  "id": "web_fetch",
  "name": "Web Fetch",
  "description": "Fetch and extract readable text from a URL. Use after web_search to get details. Only for public http/https URLs.",
  "category": "web",
  "permissionLevel": 1,
  "phase": "4",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "required": ["url"],
    "properties": {
      "url": { "type": "string", "format": "uri", "pattern": "^https?://.*" },
      "maxChars": { "type": "integer", "minimum": 500, "maximum": 15000, "default": 8000 }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["url","content","title"],
    "properties": {
      "url": { "type": "string" },
      "title": { "type": "string" },
      "content": { "type": "string", "description": "Teks bersih, markdown" },
      "truncated": { "type": "boolean" }
    }
  }
}
```

**Contoh:** Input `{ "url":"https://developer.android.com/tools/cli" }` → Output `{ "title":"CLI Overview","content":"# CLI ...", "truncated": false }`
**Error:** `FETCH_FAILED` (404, retryable:false), `TIMEOUT` (true), `BLOCKED_URL` (private IP, retryable:false)

---

##### TOOL-03: `file_read` — L1 / LOW

**Deskripsi:** Baca file teks dari workspace sandbox (`/home/user` atau InsForge storage). Tidak dapat baca file sistem atau di luar workspace. Untuk cek error log, baca hasil, baca project file.

```json
{
  "id": "file_read",
  "name": "File Read",
  "description": "Read a text file from the sandboxed workspace (/home/user). Use to inspect logs, project files, or previous results. Cannot read system files.",
  "category": "file",
  "permissionLevel": 1,
  "phase": "4",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "required": ["path"],
    "properties": {
      "path": { "type": "string", "minLength": 1, "description": "Path relative ke workspace, ex: 'build.log' atau 'project/README.md'" },
      "encoding": { "type": "string", "enum": ["utf-8"], "default": "utf-8" }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["path","content"],
    "properties": {
      "path": { "type": "string" },
      "content": { "type": "string" },
      "size": { "type": "integer" }
    }
  }
}
```

**Error:** `FILE_NOT_FOUND` (false), `PATH_TRAVERSAL_BLOCKED` (false), `FILE_TOO_LARGE` (>1MB, false)

---

##### TOOL-04: `file_write` — L2 / MEDIUM

**Deskripsi:** Buat atau tulis ulang file teks di workspace. Reversible (dapat di-undo). JANGAN gunakan untuk menghapus file sistem. Untuk menyimpan ringkasan, hasil riset, atau perbaikan file.

```json
{
  "id": "file_write",
  "name": "File Write",
  "description": "Create or overwrite a text file in the workspace. Reversible. Use to save summaries, reports, or fix files.",
  "category": "file",
  "permissionLevel": 2,
  "phase": "4",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "required": ["path","content"],
    "properties": {
      "path": { "type": "string", "minLength": 1 },
      "content": { "type": "string", "maxLength": 500000 }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["path","bytesWritten"],
    "properties": {
      "path": { "type": "string" },
      "bytesWritten": { "type": "integer" },
      "preview": { "type": "string", "description": "50 chars preview" }
    }
  }
}
```

**Error:** `INVALID_PATH` (false), `QUOTA_EXCEEDED` (false), `WRITE_FAILED` (true — retry sekali)
**Catatan L2:** Tidak butuh approval di MVP, tapi log + dapat di-undo via `file_write` dengan konten lama (disimpan di Task Memory).

---

##### TOOL-05: `android_app_launch` — L1 / LOW

**Deskripsi:** Buka aplikasi Android via Intent. Hanya dapat membuka, tidak dapat mengontrol UI di dalam aplikasi (terbatas Phase 4 MVP). Untuk "Buka Chrome/Settings".

```json
{
  "id": "android_app_launch",
  "name": "Android App Launch",
  "description": "Launch an Android app via Intent. Only opens the app, does not control inner UI in MVP. Use for 'open Chrome/Settings'.",
  "category": "android",
  "permissionLevel": 1,
  "phase": "4",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "required": ["package"],
    "properties": {
      "package": { "type": "string", "description": "Package name, ex: 'com.android.chrome' atau alias 'chrome'" },
      "action": { "type": "string", "enum": ["MAIN","VIEW"], "default": "MAIN" },
      "uri": { "type": "string", "description": "Optional URI untuk VIEW, ex: 'https://example.com'" }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["package","launched"],
    "properties": {
      "package": { "type": "string" },
      "launched": { "type": "boolean" },
      "message": { "type": "string" }
    }
  }
}
```

**Error:** `APP_NOT_FOUND` (false), `INTENT_FAILED` (true)
**Implementasi MVP:** Via Capacitor Plugin `AppLauncher`. Di sandbox Vercel, mock sebagai SUCCESS untuk testing.

---

##### TOOL-06: `device_info` — L0 / LOW

**Deskripsi:** Baca informasi perangkat read-only (model, OS version, waktu, baterai). Tidak butuh permission sensitif.

```json
{
  "id": "device_info",
  "name": "Device Info",
  "description": "Get read-only device information (model, OS, time, battery). No sensitive permission required.",
  "category": "android",
  "permissionLevel": 0,
  "phase": "4",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "fields": { "type": "array", "items": { "type": "string", "enum": ["model","os","time","battery","all"] }, "default": ["all"] }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["info"],
    "properties": {
      "info": {
        "type": "object",
        "properties": {
          "model": { "type": "string" },
          "os": { "type": "string" },
          "time": { "type": "string" },
          "battery": { "type": "integer" }
        }
      }
    }
  }
}
```

---

##### TOOL-07: `memory_search` — L1 / LOW

**Deskripsi:** Cari di Memory System (Conversation + Long-Term + User Knowledge + Task Memory terikat taskId). Gunakan untuk mengingat preferensi atau hasil task sebelumnya.

```json
{
  "id": "memory_search",
  "name": "Memory Search",
  "description": "Search across Conversation, Long-Term, User Knowledge, and Task Memory (if taskId provided). Use to recall preferences or prior results.",
  "category": "memory",
  "permissionLevel": 1,
  "phase": "3",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "required": ["query"],
    "properties": {
      "query": { "type": "string", "minLength": 2 },
      "taskId": { "type": "string", "description": "Jika diisi, juga cari di Task Memory task tersebut" },
      "limit": { "type": "integer", "minimum": 1, "maximum": 10, "default": 3 }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["results"],
    "properties": {
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id","type","content","relevance"],
          "properties": {
            "id": { "type": "string" },
            "type": { "type": "string", "enum": ["conversation","task","long_term","user_knowledge"] },
            "content": { "type": "string" },
            "relevance": { "type": "number" }
          }
        }
      }
    }
  }
}
```

---

##### TOOL-08: `memory_save` — L2 / MEDIUM

**Deskripsi:** Simpan ke Long-Term Memory atau User Knowledge. Hanya simpan jika relevan (relevance > threshold). Untuk menyimpan preferensi atau fakta penting.

```json
{
  "id": "memory_save",
  "name": "Memory Save",
  "description": "Save to Long-Term Memory or User Knowledge. Only for relevant facts/preferences. Requires relevance check.",
  "category": "memory",
  "permissionLevel": 2,
  "phase": "3",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "required": ["content","type"],
    "properties": {
      "content": { "type": "string", "minLength": 5, "maxLength": 2000 },
      "type": { "type": "string", "enum": ["long_term","user_knowledge"] },
      "key": { "type": "string", "description": "Wajib jika type=user_knowledge, ex: 'preferred_language'" }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["id","saved"],
    "properties": {
      "id": { "type": "string" },
      "saved": { "type": "boolean" },
      "type": { "type": "string" }
    }
  }
}
```

**Error:** `RELEVANCE_TOO_LOW` (false — LLM judge menolak), `QUOTA_EXCEEDED` (false)

---

##### TOOL-09: `ask_user` — L0 / LOW

**Deskripsi:** Minta klarifikasi atau konfirmasi dari pengguna. Satu-satunya tool yang menghasilkan `REQUIRES_CONFIRMATION` secara eksplisit. Untuk human-in-the-loop.

```json
{
  "id": "ask_user",
  "name": "Ask User",
  "description": "Ask user for clarification or confirmation. Use when intent unclear or before HIGH-risk actions. Returns user response.",
  "category": "system",
  "permissionLevel": 0,
  "phase": "2",
  "status": "mvp_v1",
  "inputSchema": {
    "type": "object",
    "required": ["question","options"],
    "properties": {
      "question": { "type": "string", "minLength": 5 },
      "options": { "type": "array", "items": { "type": "string" }, "minItems": 2, "maxItems": 4 },
      "context": { "type": "string", "description": "Konteks untuk ditampilkan di UI" }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "required": ["answer"],
    "properties": {
      "answer": { "type": "string", "description": "Jawaban user atau 'confirmed'/'cancelled'" },
      "selectedOption": { "type": "string" }
    }
  }
}
```

**Alur:** Execution Engine menerima `REQUIRES_CONFIRMATION` → UI tampilkan kartu `[Confirm] [Cancel] [Edit]` → tunggu input user → lanjutkan plan.

---

#### 4.3 Extended Tools — Spesifikasi tetapi Ditunda (Bukan MVP v1)

> Tools ini **sudah didesain** agar Tool System terbukti extensible, tetapi **tidak termasuk MVP v1**. Mereka akan diaktifkan di Phase 4 extended / Phase 5 setelah gate HIGH stabil. Ditampilkan di sini untuk membuktikan arsitektur tidak terkunci.

| Tool ID | Level | Label UI | Phase D00 | Status | Catatan |
|---------|-------|----------|-----------|--------|---------|
| `terminal_exec` | L3 | HIGH | Phase 4 | **extended** | Jalankan shell command di sandbox. Butuh approval HIGH. Timeout 15s. |
| `android_intent` | L3 | HIGH | Phase 4 | **extended** | Kirim Intent dengan data (share, send). Butuh approval HIGH. |
| `web_automation` | L3 | HIGH | Phase 5 | **planned** | Navigasi browser kompleks — Phase 5 |
| `file_delete` | L4 | HIGH | Phase 4 | **planned** | Hapus file — L4, explicit confirm + warning merah |

**Contoh `terminal_exec` schema (untuk referensi, tidak aktif di MVP v1):**
```json
{
  "id": "terminal_exec",
  "permissionLevel": 3,
  "inputSchema": { "required":["command"], "properties": { "command": {"type":"string"}, "cwd": {"type":"string"} } },
  "outputSchema": { "required":["stdout","exitCode"], "properties": { "stdout":{"type":"string"}, "stderr":{"type":"string"}, "exitCode":{"type":"integer"} } }
}
```

---

### 5. Permission Enforcement — Detail Teknis

```typescript
// Mapping otoritatif — tidak boleh diubah tanpa update D03
const PERMISSION_MAP = {
  0: { label:"LOW", gate:"auto" },
  1: { label:"LOW", gate:"auto" },
  2: { label:"MEDIUM", gate:"auto_undoable" },
  3: { label:"HIGH", gate:"require_approval" },
  4: { label:"HIGH", gate:"require_explicit_confirm" }
}

class PermissionGate {
  canExecute(level: 0|1|2|3|4, autonomy: AutonomyLevel): GateResult {
    if (level <= 2) return { allowed:true } // LOW/MEDIUM auto di semua mode
    // HIGH (L3/L4)
    if (autonomy === "Autonomous") return { allowed:true, warning:"HIGH auto-executed in Autonomous" }
    if (autonomy === "Semi-Autonomous" && level === 3) return { allowed:true, warning:"L3 auto in Semi-Auto" }
    return { allowed:false, requires:"USER_APPROVAL", uiLabel:"HIGH", message:"Tindakan HIGH memerlukan konfirmasi Anda" }
  }
}
```

**UI Rendering:**
- Tool call LOW → badge hijau, log saja
- MEDIUM → badge kuning, log + undo button
- HIGH → kartu approval merah: `Agent ingin menjalankan [terminal_exec] — HIGH RISK. [Approve] [Edit] [Cancel]`

---

### 6. Error Handling & Retry (D00 Bab 17)

**Setiap ToolResult.error harus memiliki `retryable` boolean:**

| Error Code | Retryable | Tindakan Execution Engine |
|------------|-----------|---------------------------|
| `TIMEOUT`, `NETWORK_ERROR`, `WRITE_FAILED` | true | Retry max 2x dengan backoff (1s, 3s). Hanya untuk L0-L3. L4 tidak retry. |
| `FILE_NOT_FOUND`, `APP_NOT_FOUND`, `INVALID_INPUT`, `PATH_TRAVERSAL_BLOCKED`, `RELEVANCE_TOO_LOW` | false | Langsung `FAILED` → Verifier diagnose → alternative plan atau `ask_user` |
| `PERMISSION_DENIED`, `BLOCKED` | false | `BLOCKED` → minta user ubah permission atau autonomy level |

**Status mapping (D00 Bab 17):**
- `SUCCESS` → lanjut step berikutnya
- `FAILED` (retryable) → `RETRYING` (max 2)
- `FAILED` (non-retryable) → `FAILED` → Verifier
- `BLOCKED` → `BLOCKED` → `ask_user`
- `REQUIRES_CONFIRMATION` → `AWAITING_APPROVAL` → tunggu user

---

### 7. Observability — Logging (D00 Bab 16)

**Setiap eksekusi tool wajib log:**

```json
{
  "taskId": "uuid-123",
  "toolId": "web_search",
  "permissionLevel": 1,
  "riskLabel": "LOW",
  "input": { "query": "Android CLI" },
  "output": { "results": [...] },
  "status": "SUCCESS",
  "durationMs": 842,
  "timestamp": "2026-09-12T02:30:00Z",
  "retryCount": 0
}
```

- Disimpan di **Task Memory** (`task_memories` table) + persistent `tool_logs` table (InsForge)
- UI: ringkas `web_search — LOW — 0.8s — SUCCESS`. Detail expand untuk debug.

---

### 8. Extensibility Pattern — Cara Menambah Tool Baru (Tanpa Ubah Core)

**Langkah (sesuai D00 Rule 04 Modular):**

```typescript
// 1. Definisikan tool baru — tidak sentuh Agent Core
const calendarCreateTool: ToolDefinition = {
  id: "calendar_create",
  name: "Calendar Create",
  description: "Create a calendar event. Use when user asks to schedule something. Requires date/time.",
  category: "automation",
  permissionLevel: 3, // HIGH
  inputSchema: {
    type: "object",
    required: ["title","date"],
    properties: {
      title: { type:"string" },
      date: { type:"string", format:"date-time" },
      durationMinutes: { type:"integer", default:60 }
    }
  },
  outputSchema: {
    type:"object",
    required:["eventId"],
    properties: { eventId:{type:"string"}, title:{type:"string"} }
  },
  phase: "5",
  status: "planned",
  execute: async (input, ctx) => {
    // implementasi — hanya di sini
    const event = await calendarAPI.create(input)
    return event
  },
  version: "1.0.0"
}

// 2. Register — satu baris
registry.register(calendarCreateTool)

// 3. Planner LLM otomatis melihat tool baru via getToolSchemasForLLM()
// Tidak perlu ubah prompt Agent Core — planner akan memilihnya jika relevan
```

**Validasi Feature Gate sebelum register (D00 Bab 12):**
- Apakah meningkatkan kemampuan agent? Ya → lanjut
- Apakah dibutuhkan sekarang? Jika tidak → tunda ke Phase 6
- Apakah aman (permission tepat)? Wajib L3/HIGH untuk side effect
- Apakah modular? Ya → register saja

---

### 9. Security & Validation (D00 Bab 18)

- **Input validation:** Semua input divalidasi dengan `inputSchema` **sebelum** `execute()` dipanggil. Tolak `PATH_TRAVERSAL` (`..` di path), `BLOCKED_URL` (private IP, localhost), injection.
- **Output validation:** Output divalidasi dengan `outputSchema` **setelah** eksekusi. Jika tidak valid → `FAILED` dengan `retryable:false`.
- **Least Privilege:** Tool tidak dapat akses di luar yang dideklarasikan. `file_read` tidak bisa baca `/etc/passwd`, hanya `/home/user/**`.
- **Secrets:** Tidak ada tool yang menerima API key via input. Semua via InsForge Secrets.

---

### 10. Testing Strategy (D00 Bab 25 Definition of Done)

Setiap tool wajib lulus:
1. **Schema test:** Valid & invalid input → error yang benar
2. **Permission test:** L1 tool tidak boleh minta approval, L3 harus `REQUIRES_CONFIRMATION` di mode Manual
3. **Retry test:** `TIMEOUT` → retry 2x → SUCCESS, `FILE_NOT_FOUND` → tidak retry
4. **Integration test:** Planner memilih tool dengan benar dari deskripsi
5. **Security test:** Path traversal, blocked URL ditolak

---

### 11. Rencana Implementasi — Fase D00 §20

| Tahap | Tools | Status |
|-------|-------|--------|
| **Phase 2 — Agent Core** | `ask_user` | Aktif |
| **Phase 3 — Memory** | `memory_search`, `memory_save` | Aktif |
| **Phase 4 — Tools (MVP v1)** | `web_search`, `web_fetch`, `file_read`, `file_write`, `android_app_launch`, `device_info` | **MVP Tool Set v1 — WAJIB** |
| **Phase 4 — Tools (extended)** | `terminal_exec`, `android_intent` | Desain siap, aktif setelah gate HIGH stabil |
| **Phase 5 — Autonomous** | `web_automation`, `scheduled_task` | Planned, via Feature Gate |
| **Phase 6 — Intelligence** | `calendar_create`, `database_tool`, dll | Ditunda, extensible |

---

### 12. Lampiran — Contoh Plan dengan MVP Tool Set v1

**Goal:** “Cari materi Android CLI, rangkum, simpan hasilnya”

```json
{
  "goal": "Rangkum materi Android CLI",
  "steps": [
    { "id": 1, "tool": "web_search", "input": { "query": "Android CLI documentation" }, "permissionLevel": 1, "riskLabel": "LOW" },
    { "id": 2, "tool": "web_fetch", "input": { "url": "https://developer.android.com/tools/cli" }, "permissionLevel": 1, "riskLabel": "LOW" },
    { "id": 3, "tool": "file_write", "input": { "path": "rangkuman-android-cli.md", "content": "# Rangkuman ...\n..." }, "permissionLevel": 2, "riskLabel": "MEDIUM" },
    { "id": 4, "tool": "memory_save", "input": { "content": "User tertarik Android CLI", "type": "long_term" }, "permissionLevel": 2, "riskLabel": "MEDIUM" }
  ]
}
```

**Eksekusi:** Semua L1-L2 → auto tanpa approval (sesuai MVP). Verifier cek file tertulis → SUCCESS → simpan ke Task Memory.

---

> **Prinsip Final:** Tool System adalah **platform**, bukan daftar tetap. MVP Tool Set v1 membuktikan agent bisa *Think-Act-Verify*, extensibility via Registry membuktikan ia bisa tumbuh menjadi Level 4 Device Agent tanpa merombak fondasi.

**Next:** Dokumen 04 — Agent Core & Planner Specification (bagaimana planner memilih tool dari registry ini)

