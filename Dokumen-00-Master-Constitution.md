# Dokumen 00 — 8bitAI Master Constitution & Project Rules
> **Status:** FINAL — Source of Truth Level 00
> **Tanggal:** 12 September 2026
> **Lokasi:** Kudus, Central Java, ID
> **Versi:** 1.0

Dokumen ini menjadi konstitusi utama 8bitAI. Semua dokumen, prompt, desain, arsitektur, kode, dan pengembangan berikutnya harus tunduk pada aturan ini.

---

### 1. Identitas Proyek
- **Nama proyek:** 8bitAI
- **Platform utama:** Android
- **Target level:** Level 4 — Autonomous AI Agent
- 8bitAI bukan sekadar chatbot atau aplikasi AI biasa. Tujuan akhirnya adalah menjadi AI Agent pribadi yang dapat memahami perintah, merencanakan pekerjaan, menggunakan tools, menjalankan tindakan, mempertahankan konteks, dan bekerja secara semi-otonom dengan kontrol pengguna.

### 2. Visi
8bitAI adalah AI Agent pribadi yang menjadi pusat kendali digital pengguna.
8bitAI harus mampu berkembang dari:
```
Ask → Understand → Plan → Execute → Verify → Remember → Improve
```
Bukan hanya: `Ask → Answer`

### 3. Prinsip Utama
**Rule 01 — User First:** Pengguna tetap menjadi pengendali utama. Agent boleh menganalisis, merencanakan, menyarankan, menjalankan tugas yang diizinkan, menggunakan tools. Tetapi tidak boleh mengambil keputusan berisiko tinggi tanpa otorisasi yang sesuai.

**Rule 02 — Agent, Bukan Chatbot:** Semua fitur baru harus dipertimbangkan dari sudut: “Apakah ini membuat 8bitAI lebih mampu menyelesaikan pekerjaan?” Bukan sekadar: “Apakah ini membuat chat terlihat lebih bagus?”

**Rule 03 — Tool-First:** Kemampuan agent tidak boleh dipaksakan masuk ke dalam model AI. Jika pekerjaan membutuhkan web, file, database, Android, terminal, API, automation, kalender, aplikasi eksternal maka 8bitAI harus menggunakan tool yang sesuai.

**Rule 04 — Modular:** Setiap kemampuan harus dapat ditambahkan, dihapus, diperbarui, diuji, diganti tanpa merusak keseluruhan sistem.

**Rule 05 — Tidak Overengineering:** Sesederhana mungkin untuk MVP, tetapi memiliki fondasi yang memungkinkan pengembangan jangka panjang. Jangan membangun sistem enterprise yang belum diperlukan, abstraksi berlebihan, microservices terlalu dini, fitur kosmetik yang tidak meningkatkan kemampuan agent.

### 4. Target Arsitektur
```
                    ┌─────────────────────┐
                    │       USER          │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    8bitAI UI        │
                    │ Android Interface   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    AGENT CORE       │
                    │  Understand / Plan  │
                    │  Execute / Verify   │
                    └──────────┬──────────┘
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
       ┌──────────┐      ┌──────────┐      ┌──────────┐
       │  TOOLS   │      │  MEMORY  │      │  MODELS  │
       └──────────┘      └──────────┘      └──────────┘
             │                 │                 │
             └─────────────────┼─────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ External Services   │
                    │ APIs / Web / Apps   │
                    └─────────────────────┘
```

### 5. Komponen Inti
**5.1 Agent Core** — Otak orkestrasi: memahami tujuan, menentukan langkah, memilih tools, menjalankan workflow, memeriksa hasil, meminta konfirmasi.

**5.2 Model Layer** — Lapisan abstraksi untuk AI model. Harus memungkinkan multi-provider/model. Agent tidak boleh bergantung langsung pada satu provider.

**5.3 Tool System** — Setiap tool harus memiliki: nama, deskripsi, input schema, output schema, permission level, execution status, error handling. Contoh: Web, File, Search, Terminal, Android, Browser, Database, Automation Tool.

**5.4 Memory System** — Short-Term Context → Conversation Memory → Long-Term Memory → User Knowledge. Harus memiliki aturan: relevansi, persistensi, keamanan, kontrol pengguna, penghapusan.

**5.5 Execution Engine** — Goal → Plan → Step 1 → Step 2 → Tool Call → Result → Verify → Continue/Retry/Ask User

**5.6 Permission & Safety Layer:**
- LEVEL 0 Informasi
- LEVEL 1 Read-only
- LEVEL 2 Low-risk action
- LEVEL 3 External side effect
- LEVEL 4 Sensitive / irreversible action

### 6. Autonomous Agent Rule
Manual → Assisted → Semi-Autonomous → Autonomous. Autonomy adalah kontrol yang dapat diatur, bukan kondisi selalu aktif.

### 7. Human-in-the-Loop
Konfirmasi diperlukan untuk: menghapus data, mengirim sesuatu, transaksi, perubahan sistem penting, tindakan irreversible, dampak eksternal signifikan.
Format: `Rencana selesai. Saya akan menjalankan X. [Approve] [Cancel] [Edit]`

### 8. Android sebagai Platform
Android sebagai execution environment: Apps, Notifications, Files, Clipboard, Share, Intent, Browser, Deep Links, System Actions, Automation — dengan permission & batasan keamanan Android.

### 9. Backend & Infrastructure (MVP)
- **Frontend/Application:** Android (Web technology → Capacitor → Android jika sesuai)
- **Backend/Database:** InsForge (database, authentication, backend services)
- **Repository:** GitHub (source code, version control, CI/CD)
- **Deployment:** Vercel (komponen web/backend yang sesuai)

### 10. Source of Truth
```
00 — Master Constitution
        ↓
Architecture Documents
        ↓
Feature Specifications
        ↓
Implementation Specifications
        ↓
Source Code
```
Jika konflik: Dokumen yang lebih tinggi mengalahkan yang lebih rendah.

### 11. Aturan Konsistensi Dokumen
Setiap dokumen baru harus tidak bertentangan dengan Dokumen 00, menggunakan istilah yang sudah ditetapkan, tidak mendefinisikan ulang konsep final tanpa alasan, menyatakan perubahan jika diperlukan, tidak membuat fitur “mungkin berguna”, menjaga kompatibilitas.

### 12. Feature Gate
Sebelum fitur baru: Apakah meningkatkan kemampuan agent? Benar-benar dibutuhkan? Sesuai arsitektur? Dapat dibuat modular? Aman? Layak untuk tahap saat ini? Jika sebagian besar “tidak”, fitur ditunda.

### 13. MVP Philosophy
MVP = versi terkecil yang sudah membuktikan 8bitAI dapat bertindak sebagai AI Agent.
Prioritas: Agent Core → Model → Tool System → Memory → Execution → Android Integration
Bukan: UI cantik, Animations, Themes, Dozens of features

### 14. UX Philosophy
UI harus clean, cepat, jelas, minimal, responsive, mudah digunakan di Android. 8-bit adalah identitas visual/branding, bukan batasan teknologi.

### 15. Agent Interaction
Pola utama: `Understand → Plan → Inspect → Identify error → Propose action → Execute → Test → Report`
Contoh: “Buka folder proyek saya, cek error build terakhir, lalu perbaiki kalau memungkinkan.”

### 16. Observability
Setiap execution penting harus dapat ditelusuri: Task → Plan → Tool calls → Results → Errors → Retries → Final result

### 17. Error Handling
Agent tidak boleh berpura-pura berhasil. Status: SUCCESS / PARTIAL_SUCCESS / FAILED / BLOCKED / REQUIRES_CONFIRMATION
Alur gagal: FAILED → Diagnose → Retry if safe → Alternative approach → Ask user

### 18. Security Principles
Least Privilege. Tidak boleh: meminta permission tanpa alasan, menyimpan secret sembarangan, mengekspos credential, menjalankan tindakan berbahaya tanpa kontrol, memberikan akses tool berlebihan.

### 19. Data Ownership
Data pengguna milik pengguna. Sistem harus mendukung: View, Export, Delete, Clear, Control.

### 20. Development Strategy
- Phase 1 — Foundation (Repository, Android shell, Backend, Model connection, Basic UI)
- Phase 2 — Agent Core (Agent, Planner, Execution, Tool registry)
- Phase 3 — Memory (Conversation, Persistent memory, User context)
- Phase 4 — Tools (Web, Files, Android, Automation, External APIs)
- Phase 5 — Autonomous Workflow (Planning, Execution, Verification, Retry, Long-running tasks)
- Phase 6 — Intelligence Expansion

### 21. GitHub Workflow
`main → development → feature/* → fix/*` — Commit harus jelas, perubahan besar dapat dilacak.

### 22. Arena.ai Rule
Gunakan alur: Constitution → Architecture → Module Specification → Implementation → Test → Review → Next Module. Jangan membuat seluruh proyek dalam satu prompt raksasa.

### 23. Agent vs Direct Mode
- **Agent Mode:** reasoning, multi-step execution, tools, banyak file, implementasi fitur, debugging, refactoring
- **Direct Mode:** perubahan kecil, satu file, satu tugas terisolasi, deterministik
- **Default 8bitAI:** Agent Mode

### 24. Rule Anti-Drift
Tidak boleh: ganti nama proyek, ganti stack tanpa alasan, buat arsitektur baru sendiri, hapus fitur yang disepakati, ubah kontrak API tanpa dokumentasi, buat dependency baru tanpa alasan, duplicate implementation. Jika konflik: STOP → IDENTIFY → REPORT → WAIT FOR DECISION

### 25. Definition of Done
`Specification → Implementation → Integration → Testing → Error Handling → Security Check → Documentation → Done`

### 26. Prinsip Pengembangan Jangka Panjang
AI Assistant → AI Agent → Personal Agent Platform → Personal Digital Operating Layer. Jangan membangun kompleksitas masa depan sebelum fondasi diperlukan.

### 27. Golden Rules
1. 8bitAI adalah Agent, bukan sekadar chatbot.
2. User tetap memiliki kontrol.
3. Agent harus mampu menggunakan tools.
4. Autonomy harus dapat dikontrol.
5. Semua sistem harus modular.
6. MVP harus kecil dan benar-benar berfungsi.
7. Jangan overengineering.
8. Security dan permission adalah bagian dari arsitektur, bukan tambahan.
9. Semua dokumen dan implementasi harus konsisten.
10. Jika ada konflik, Master Constitution menjadi sumber kebenaran tertinggi.

### 28. Prinsip Final
> Build the smallest system that can think, act, verify, and learn — then expand it carefully.
> 8bitAI tidak dibangun untuk menjadi aplikasi dengan sebanyak mungkin fitur.
> 8bitAI dibangun untuk menjadi satu sistem yang semakin mampu menyelesaikan pekerjaan pengguna.

**Dokumen 00 = FINAL PROJECT CONSTITUTION. Semua dokumen berikutnya harus mengacu pada dokumen ini.**
