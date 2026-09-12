# D08 — UI / Control Surface Specification
> **Status:** DRAFT → siap dikunci setelah review
> **Authority:** UI / Control Surface Layer
> **Depends On:** D00, D01, D02, D03, D04, D05, D06, D07, D07A, D07B
> **Authority Boundary:** UI bukan execution authority, scheduler authority, persistence authority, atau security authority.
> **Date:** 2026-09-12 — Kudus, ID

---

## 1. Purpose
D08 mendefinisikan kontrak resmi antara seluruh sistem 8bitAI dan lapisan antarmuka pengguna. D08 menentukan: bagaimana state sistem dipresentasikan; bagaimana user memberikan intent; bagaimana UI meminta operasi kepada application/service layer; bagaimana execution ditampilkan; bagaimana offline/sync ditampilkan; bagaimana error, retry, conflict, permission, dan recovery ditampilkan; bagaimana UI berinteraksi dengan Android; bagaimana tablet, phone, stylus, keyboard, dan touch digunakan. D08 tidak menentukan: bagaimana execution dijalankan; bagaimana scheduling dilakukan; bagaimana queue disimpan; bagaimana authentication token disimpan; bagaimana conflict diselesaikan secara internal; bagaimana database bekerja. Semua hal tersebut tetap berada pada authority masing-masing.

## 2. Fundamental UI Principle
Arsitektur UI:
```
User → UI / Control Surface → Application Command / Query Boundary → Domain / Service Layer → D07 Execution Engine / D07A Scheduler / D07B SyncQueue / D06 Android → External Systems
```
UI tidak boleh:
```
UI
 ├── execute tool directly       ❌
 ├── write database directly     ❌
 ├── manipulate sync queue       ❌
 ├── generate auth token         ❌
 ├── decide retry policy         ❌
 ├── resolve conflict itself     ❌
 └── bypass execution engine    ❌
```
UI hanya: `Intent → Command → Observe State → Render State → Request User Confirmation`

## 3. UI Authority Boundary
**UI MAY:** menerima input user; menampilkan state; mengirim command; meminta confirmation; menampilkan progress; menampilkan error; meminta retry; meminta cancel; menampilkan sync status; menampilkan conflict; menampilkan audit information; membuka Android integration surface.
**UI MUST NOT:** mengubah state execution secara langsung; mengubah queue state secara langsung; menentukan apakah error retryable; menentukan conflict winner; membuat idempotency key sendiri; mengakses credential/token; mengubah security policy; mem-bypass permission; melakukan mutation tanpa command boundary.

## 4. UI Architecture
D08 menggunakan pola:
```
                    ┌───────────────┐
                    │      UI       │
                    └───────┬───────┘
                            │
                 Commands / Queries
                            │
                    ┌───────▼───────┐
                    │ Application   │
                    │    Facade     │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
   ExecutionService    MemoryService       SyncService
        ↓                   ↓                   ↓
       D07                 D05                 D07B
        ↓
      D07A
```
UI tidak mengenal implementation detail repository.

## 5. Application UI Contract
UI berkomunikasi melalui dua kategori:
**Commands** (meminta perubahan): CreateTask, ExecuteTask, CancelTask, PauseTask, ResumeTask, RetryTask, SendMessage, CreateMemory, UpdateMemory, DeleteMemory, ResolveConflict, OpenAndroidApp, RefreshData
**Queries** (membaca state): GetDashboard, GetExecution, GetExecutions, GetMemory, GetSyncStatus, GetPendingSyncItems, GetConflict, GetTools, GetAndroidApps, GetAuditLog

## 6. App Shell
Root UI:
```
┌───────────────────────────────────────┐
│ Top Bar                               │
├──────────┬────────────────────────────┤
│          │                            │
│ Sidebar  │       Content Area         │
│          │                            │
├──────────┴────────────────────────────┤
│ Status / Sync / System Indicator      │
└───────────────────────────────────────┘
Mobile:
┌──────────────────────┐
│ Top Bar              │
├──────────────────────┤
│ Content              │
├──────────────────────┤
│ Bottom Navigation    │
└──────────────────────┘
```

## 7. Primary Navigation
Minimal navigation: Home, Chat, Tasks, Tools, Memory, Activity, Settings
- **Home:** Ringkasan sistem
- **Chat:** Agent interaction
- **Tasks:** Execution lifecycle
- **Tools:** Tool discovery dan invocation
- **Memory:** Memory inspection dan management
- **Activity:** Journal, audit, execution history, sync activity
- **Settings:** Configuration dan system controls

## 8. Dashboard
Dashboard tidak menjadi source of truth — adalah projection.
```
┌──────────────────────────────┐
│ Good afternoon, 8Bit         │
│ System ● Online              │
│ Active Tasks        3        │
│ Pending Sync       7        │
│ Failed Tasks       1        │
│ Conflicts          0         │
│ Recent Activity              │
│ ───────────────────────────  │
│ Task completed               │
│ Memory updated               │
│ Sync completed               │
└──────────────────────────────┘
```
Semua angka berasal dari service/query.

## 9. Agent Conversation Surface
Chat merupakan primary human-agent interaction. Struktur: `Conversation → User Message → Agent Response → Tool Intent → Tool Execution → Result → Follow-up` — UI harus membedakan: thinking, planning, awaiting_confirmation, executing, completed, failed, cancelled — Jangan menampilkan internal chain-of-thought. Yang ditampilkan adalah user-safe progress/status.

## 10. Execution Control Surface
Task detail:
```
┌───────────────────────────────┐
│ Task: Generate report         │
│ Status ● RUNNING              │
│ Started 14:32  Duration 12s   │
│ Progress ███████████░░░ 72%  │
│ [ Pause ] [ Cancel ]          │
└───────────────────────────────┘
```
UI hanya mengirim: `PauseTask(taskId), CancelTask(taskId)` — Scheduler/Engine menentukan hasil sebenarnya.

## 11. Execution State Projection
UI mendukung state: QUEUED, SCHEDULED, RUNNING, PAUSE_REQUESTED, PAUSED, CANCEL_REQUESTED, COMPLETED, FAILED, CANCELLED — UI tidak boleh menciptakan state tambahan yang bertentangan dengan D07.

## 12. Sync Status Surface
Global indicator: `● Synced | ◐ Syncing | ○ Offline | ! Sync attention`
Detail:
```
Sync Status — Online
Pending       4
Sending       1
Failed        0
Conflict      0
Last successful sync: 12 Sep 2026 · 15:27
```

## 13. Offline UX
Offline bukan error — adalah valid operational state.
```
You're offline.
Your changes are saved locally and will sync automatically when connection is restored.
Pending changes: 4
```
User tetap dapat melakukan operation yang diizinkan.

## 14. Pending Mutation UX
Setelah mutation berhasil secara lokal: `Saved locally — Waiting for sync` — Bukan `Failed` karena server belum menerima.

## 15. Sync Queue UI
User tidak perlu melihat internal queue secara default. Advanced view:
```
Sync Queue
PENDING       4
SENDING       1
RETRYING      0
FAILED        1
CONFLICT      0
Detail: Student Update — Aggregate: student:123 — Version: 17 — Status: PENDING — Last attempt: Never
```
idempotencyKey tidak perlu ditampilkan kecuali diagnostic mode.

## 16. Retry UI
Retry button hanya muncul ketika service menyatakan operation dapat di-retry.
```
Sync failed — Network unavailable. [ Retry ]
```
UI tidak menentukan retryability.

## 17. Conflict UI
Conflict harus dijelaskan dengan bahasa user:
```
This information was changed somewhere else.
Your local version ... | Remote version ...
[Use Remote] [Review Changes]
```
Untuk resolver sudah tetapkan: `Remote version was kept because the remote version is newer.` — UI tidak menjadi ConflictResolver.

## 18. Journal / Audit UI
Journal harus dianggap immutable append-only.
```
Activity
15:31  Task completed
15:30  Tool executed
15:29  Memory updated
15:28  Sync completed
15:27  Task started
```
Tidak menyediakan: Edit journal, Delete journal, Reorder journal

## 19. Tool Surface
Tools ditampilkan sebagai capabilities: Search, Browser, Calculator, File, Android Apps, Memory, ... — Flow: `User intent → Tool selection → Permission / confirmation → Execution → Result`

## 20. Dangerous Tool Confirmation
Operation berisiko memerlukan confirmation:
```
This action will: • Open an external application • Send data outside 8bitAI
Continue? [Cancel] [Continue]
```
Classification berasal dari policy layer, bukan UI.

## 21. Android Integration Surface
D06 menjadi authority Android. UI dapat menampilkan: `Android Apps → Installed Apps: Chrome, Files, Settings, Calculator, ...` — Saat user memilih Open Calculator → UI mengirim `OpenAndroidApp(packageId)` — tidak memanggil Android Intent langsung.

## 22. Permission UX
States: UNKNOWN, REQUESTED, GRANTED, DENIED, RESTRICTED
```
Camera access is required for this operation. [Allow]
```
UI menampilkan status, D06 menentukan mekanisme.

## 23. Error Model
Semua error diproyeksikan ke user-safe categories: NETWORK, AUTHENTICATION, PERMISSION, SECURITY, VALIDATION, CONFLICT, EXECUTION, SYSTEM, UNKNOWN — Internal stack trace tidak ditampilkan.

## 24. Error Presentation
Format:
```
What happened: We couldn't sync this change.
Why: The server could not be reached.
What you can do: Your local copy is safe. [Retry]
```

## 25. Loading States
UI harus membedakan: INITIAL_LOADING, REFRESHING, SUBMITTING, EXECUTING, SYNCING — Jangan menggunakan global spinner untuk semua.

## 26. Empty States
Empty state harus actionable:
```
No tasks yet. Create a task to start working. [Create Task]
```

## 27. Responsive Contract
Target utama: Tablet landscape, Tablet portrait, Phone portrait, Phone landscape — Prioritas: **Tablet > Phone** karena 8bitAI diarahkan untuk productivity environment.

## 28. Stylus Contract
Stylus harus menjadi first-class input. UI wajib: target sentuh cukup besar; tidak bergantung pada hover; mendukung handwriting-capable fields; menyediakan scrolling yang nyaman; mencegah accidental activation; menyediakan keyboard fallback. Minimum touch target: `44×44 dp`, Recommended: `48×48 dp`.

## 29. Keyboard Contract
Keyboard shortcuts dapat tersedia: `Ctrl+K Command Palette, Ctrl+/ Search, Ctrl+Enter Submit, Esc Cancel/Close` — Shortcut tidak boleh mengubah authority boundary.

## 30. Command Palette
```
Search commands... → Run task, Open tools, Search memory, Open settings, View activity, Sync now
```
Command palette hanya menghasilkan command.

## 31. Notification Model
Categories: EXECUTION_COMPLETED, EXECUTION_FAILED, SYNC_COMPLETED, SYNC_FAILED, CONFLICT_DETECTED, PERMISSION_REQUIRED, SYSTEM_WARNING — Notifikasi harus actionable.

## 32. State Consistency Rule
UI harus menggunakan: `SERVER / DOMAIN STATE → APPLICATION STATE → VIEW MODEL → UI` — Bukan `UI state → pretend domain state` — Optimistic UI hanya diperbolehkan jika contract domain mendukungnya.

## 33. UI State Machine
Setiap interactive feature mengikuti:
```
IDLE → INTENT → VALIDATING → SUBMITTING → OBSERVING → SUCCESS / ERROR
Untuk offline mutation:
INTENT → LOCAL_COMMIT → PENDING_SYNC → SYNCING → SYNCED
Conflict:
SYNCING → CONFLICT → RESOLVING → RECONCILED
```

## 34. ViewModel Contract
ViewModel bertugas: `Domain State → Presentation State` dan `User Event → Command` — ViewModel tidak boleh: query database langsung; manipulate SyncQueue; execute Android API; generate auth credentials; implement retry algorithm.

## 35. Component Architecture
Core components:
```
AppShell (Sidebar, TopBar, StatusBar, ContentRouter)
Feedback (Toast, Banner, Dialog, ErrorState, EmptyState)
Execution (ExecutionCard, ExecutionStatus, ExecutionProgress, ExecutionControls, ExecutionTimeline)
Sync (SyncIndicator, SyncStatus, PendingBadge, SyncError, ConflictCard)
Agent (Conversation, Message, ToolCall, ToolResult, Confirmation)
Activity (ActivityList, JournalEntry, AuditEntry)
```

## 36. Data Ownership
| Data | Authority |
|------|-----------|
| Execution | D07 |
| Scheduling | D07A |
| Sync Queue | D07B |
| Memory | D05 |
| Android | D06 |
| Security | D06 / Security layer |
| UI state | D08 |
| Presentation state | D08 |
| User preferences | Settings/Application layer |

## 37. Security UI Rules
UI MUST NOT: display access tokens; display refresh tokens; persist credentials; place credentials in URLs; include credentials in logs; expose sensitive payload unnecessarily. D07B's sanitized payload contract tetap berlaku.

## 38. Cross-User Isolation
UI harus selalu bekerja dalam active user context: `User Context → Application Boundary → Repository / Sync` — UI tidak boleh memungkinkan user A melihat projection milik user B.

## 39. Accessibility
Minimum: semantic labels; keyboard navigation; focus management; readable contrast; scalable text; screen-reader compatible controls; touch target minimum; no information conveyed by color alone.

## 40. Observability
UI boleh menampilkan: Task ID, Execution ID, Timestamp, Status, Error category, Sync state — Diagnostic mode dapat menampilkan lebih banyak metadata. UI tidak menampilkan secret/internal security material.

## 41. D08 Acceptance Criteria
- UI-001 UI tidak dapat bypass Application Boundary
- UI-002 UI tidak memiliki direct database access
- UI-003 UI tidak memiliki direct SyncQueue mutation
- UI-004 Execution state berasal dari D07
- UI-005 Scheduling state berasal dari D07A
- UI-006 Sync state berasal dari D07B
- UI-007 Offline diperlakukan sebagai valid state
- UI-008 Local success dapat ditampilkan sebelum remote sync selesai
- UI-009 Retry hanya tersedia berdasarkan retryability dari service layer
- UI-010 Conflict tidak diselesaikan oleh UI
- UI-011 Journal ditampilkan sebagai append-only
- UI-012 Android operation melalui D06 boundary
- UI-013 Credential tidak pernah menjadi UI payload
- UI-014 Cross-user data isolation enforced
- UI-015 Tablet dan phone mempunyai responsive presentation
- UI-016 Stylus interaction didukung
- UI-017 Keyboard interaction didukung
- UI-018 Accessibility baseline terpenuhi
- UI-019 Error memiliki user-safe presentation
- UI-020 UI dapat survive process recreation tanpa menciptakan state palsu

## 42. D08 Final Architecture Contract
Kontrak keseluruhan sekarang menjadi:
```
                         ┌─────────────────┐
                         │      USER       │
                         └────────┬────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │          D08           │
                     │ UI / CONTROL SURFACE   │
                     └───────────┬────────────┘
                                 │
                         Command / Query
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │ APPLICATION BOUNDARY   │
                     └───────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
        D07                    D05                    D06
    Execution               Memory                 Android
          │
          ▼
        D07A
     Scheduler
          │
          ▼
        D07B
     SyncQueue
          │
          ▼
       Transport
          │
          ▼
       InsForge
Prinsip final: D08 observes and requests. It never becomes the authority.
```

Dengan ini, D00–D08 sudah membentuk vertical architectural contract yang utuh:
- D00 Constitution → WHY / RULES
- D01 Product Vision → WHAT PRODUCT
- D02 Architecture → SYSTEM STRUCTURE
- D03 Tool System → CAPABILITIES
- D04 Agent Core → AGENT BEHAVIOR
- D05 Memory → KNOWLEDGE / CONTEXT
- D06 Android → WHERE
- D07 Execution → HOW SAFELY
- D07A Scheduler → WHEN
- D07B SyncQueue → PERSISTENCE / SYNC
- D08 UI → HUMAN CONTROL SURFACE

Status rekomendasi: D08 = READY FOR LOCK.
Setelah D08 dikunci, langkah paling tepat bukan langsung D09, melainkan D08A — UI State & Interaction Contract jika kita ingin memisahkan detail state-machine UI dari specification utama. Jika tidak, kita bisa langsung masuk ke D09 Architecture Implementation / Frontend Application Contract.

