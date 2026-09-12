# Dokumen 01 — 8bitAI Product Vision & Functional Scope
> **Status:** Draft v1.0
> **Project:** 8bitAI
> **Target:** Android
> **Development Strategy:** MVP-first, modular, extensible
> **Primary Platform:** Android
> **Architecture Direction:** AI Agent Level 4
> **Induk:** Dokumen 00 — Master Constitution (FINAL)
> **Tanggal:** 12 September 2026

## 1. Tujuan Dokumen
Dokumen ini mendefinisikan visi produk, tujuan, ruang lingkup, prinsip, dan batasan utama 8bitAI.
Dokumen ini menjadi jembatan antara:
```
Dokumen 00 — Master Constitution & Project Rules
        ↓
Dokumen 01 — Product Vision & Functional Scope
        ↓
Dokumen teknis dan implementasi berikutnya.
```
Tujuannya adalah memastikan setiap pengembangan berikutnya tetap konsisten dan tidak menghasilkan fitur yang saling bertabrakan.

## 2. Product Vision
### 2.1 Visi
8bitAI adalah AI Agent pribadi di Android yang mampu memahami perintah pengguna, menjalankan tugas, menggunakan berbagai tools, berinteraksi dengan aplikasi/perangkat, serta melakukan pekerjaan multi-step secara terkontrol.

8bitAI bukan sekadar chatbot.
Target akhirnya adalah:
`User memberikan tujuan → 8bitAI memahami → merencanakan → menggunakan tools → menjalankan tindakan → memverifikasi hasil → melaporkan hasil.`

## 3. Product Philosophy
### 3.1 User First
Pengguna selalu menjadi pihak yang memiliki kendali. AI tidak boleh mengambil tindakan penting tanpa otorisasi yang sesuai.

### 3.2 Agent, bukan sekadar Chatbot
Chat merupakan salah satu interface. Kemampuan utama 8bitAI adalah: memahami intent; membuat rencana; memilih tools; menjalankan aksi; membaca hasil; melakukan koreksi; menyelesaikan pekerjaan.

### 3.3 Tool-Centric
Kemampuan 8bitAI diperluas melalui Tools.
```
AI Core
   ├── Web Tool
   ├── File Tool
   ├── Android Tool
   ├── Shell/CLI Tool
   ├── Browser Tool
   ├── Memory Tool
   ├── Automation Tool
   └── Custom Tools
```
AI tidak perlu memiliki semua kemampuan secara langsung. AI cukup memiliki kemampuan untuk memilih dan menggunakan tool yang tersedia.

### 3.4 Modular
Setiap kemampuan harus dapat dikembangkan secara independen.
```
Core: Agent, Memory, Planner, Security
Tools: Android, Web, Files, Automation
UI: Chat, Tasks, Tools, Settings
```
Penambahan satu fitur tidak boleh merusak modul lainnya.

### 3.5 MVP First
Pengembangan dilakukan bertahap: `MVP → Agent dasar → Tool system → Android integration → Automation → Advanced Agent`

## 4. Target Pengguna
Individual power user Android yang ingin memiliki AI pribadi, mengotomatisasi pekerjaan, menghubungkan AI dengan tools, membutuhkan kontrol terhadap AI, dan sistem yang dapat dikembangkan. 8bitAI tidak dirancang sebagai aplikasi AI sosial atau platform chatbot publik.

## 5. Core User Experience
```
User: "Buka browser, cari materi X, rangkum poin pentingnya dan simpan hasilnya."
8bitAI: Understand → Plan → Select Tools → Execute → Verify → Report
```
User tidak perlu mengetahui bagaimana setiap tool bekerja.

## 6. Agent Capability Levels
- **Level 1 — Chat:** percakapan, menjawab pertanyaan, memahami konteks.
- **Level 2 — Tool Calling:** AI dapat memanggil tools, membaca hasil, memilih tool.
- **Level 3 — Multi-Step Agent:** menjalankan beberapa langkah (Search → Open → Extract → Process → Save → Report)
- **Level 4 — Device Agent (Target utama):** berinteraksi dengan perangkat Android melalui tool dan permission yang tersedia. Tindakan sensitif harus tetap mengikuti permission dan confirmation policy.

## 7. Functional Scope
### 7.1 AI Core
LLM integration; prompt/context management; intent detection; tool selection; response generation; agent loop.

### 7.2 Agent Engine
`Observe → Understand → Plan → Act → Observe → Evaluate → Repeat` — dengan batas maksimum langkah untuk mencegah infinite loop.

## 8. Tool System
Setiap tool harus memiliki kontrak yang jelas:
```
Tool { id, name, description, inputSchema, outputSchema, permission, riskLevel, execute() }
```
**Tool Categories:** Android Tools (launch app, settings, device info, notification, intent), Web Tools (search, open, extract), File Tools (create/read/modify/organize), Automation Tools (scheduled/repeated/workflow), Memory Tools (save/retrieve/update/delete).

## 9. Android Integration
```
User Request → Agent → Tool → Permission Check → Risk Check → Confirmation if required → Android API → Result
```

## 10. Permission & Safety Model
- **LOW:** membaca waktu, info perangkat, membuka aplikasi — biasanya langsung
- **MEDIUM:** membuat file, mengubah konfigurasi, menjalankan automation — dapat memerlukan konfirmasi
- **HIGH:** menghapus data, mengirim pesan, transaksi, konsekuensi eksternal — harus konfirmasi eksplisit

## 11. Human-in-the-Loop
AI boleh bertindak sejauh otorisasi dan permission mengizinkannya. Untuk tindakan berisiko: `AI: Saya siap melakukan X. [Cancel] [Confirm]`

## 12. Memory System
Short-Term Context (percakapan/task aktif), Long-Term Memory (informasi layak disimpan), Task Memory (hanya relevan dengan pekerjaan tertentu). Harus dapat dilihat, diperbarui, dihapus, dikontrol pengguna.

## 13. Task System
Membedakan Conversation dan Task. Task memiliki status: Planning → Running → Waiting → Completed, serta progress, steps, tools, result, logs.

## 14. UI Scope
```
8bitAI
├── Home / Chat
├── Tasks
├── Tools
└── Settings (AI provider, permissions, memory, security, appearance)
```

## 15. MVP Scope
**Wajib:** Android application, chat interface, AI provider integration, agent engine sederhana, tool registry, tool calling, basic memory, task execution, permission handling, logging, settings.
**Tool MVP:** Web Search, Web Open, File Read, File Write, Android App Launch, Device Information

## 16. Post-MVP
`MVP → More Tools → Android Interaction → Automation → Scheduled Agents → Multi-Agent → Advanced Memory → Remote Access → Self-Improving Workflows` — Fitur baru tidak boleh mengubah fondasi core secara sembarangan.

## 17. Non-Goals
Bukan: media sosial, game, chatbot entertainment, OS baru, aplikasi yang menggantikan Android, AI tanpa kontrol, platform yang butuh semua fitur sejak v1.

## 18. Technology Direction
```
Android
├── UI
├── Agent Runtime
├── Tool Runtime
├── Local Storage
└── Android Integration → External AI/API
```
Repository GitHub sebagai source of truth kode. Backend/cloud hanya ketika diperlukan. Prinsip: **Local-first where practical, cloud-enabled where useful.**

## 19. Development Strategy
- Phase 1 — Foundation: project, architecture, UI, configuration, AI provider
- Phase 2 — Agent: agent loop, tool registry, tool execution
- Phase 3 — Android: Android integration, permissions, app launching, device tools
- Phase 4 — Memory & Tasks: memory, task manager, execution history
- Phase 5 — Automation: scheduled tasks, workflows, background execution
- Phase 6 — Advanced Agent: long-running tasks, planning, recovery, orchestration

## 20. Definition of Success
MVP berhasil jika: “Saya memberikan tugas, dan AI tidak hanya menjawab, tetapi benar-benar mengerjakannya menggunakan tools yang tersedia.” Contoh: “Buka Chrome dan cari dokumentasi Android CLI” → Understand → Launch Chrome → Search → Open → Read → Summarize → Report

## 21. Architectural Rule
Core AI tidak boleh mengetahui detail implementasi setiap tool. Core hanya mengetahui: Tool ID, Description, Input Schema, Output Schema, Permission, Risk. Implementasi berada di luar Agent Core.
```
Agent Core → Tool Interface → Web / Android / File (dapat ditambah tanpa ubah Core)
```

## 22. Final Product Definition
8bitAI adalah personal Android AI Agent yang menggabungkan conversational AI, planning, tool calling, memory, automation, dan Android device interaction dalam satu sistem yang modular, permission-aware, dan user-controlled. Target akhir: `Chat → Think → Plan → Act → Verify → Complete.`

> Dokumen 01 ini menjadi baseline scope. Dokumen berikutnya harus memperinci implementasi tanpa memperluas scope secara sembarangan.
