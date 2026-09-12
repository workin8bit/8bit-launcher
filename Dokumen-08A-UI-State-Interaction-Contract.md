# D08A — UI State & Interaction Contract
> **Status:** READY FOR LOCK
> **Type:** Implementation Contract
> **Authority:** UI State & Interaction Layer
> **Parent:** D08 — UI / Control Surface Specification
> **Depends On:** D00–D08
> **Primary Rule:** UI State adalah projection, bukan domain authority.
> **Date:** 2026-09-12 — Kudus, ID

---

## 1. Purpose
D08A mendefinisikan kontrak detail mengenai: state UI; ownership state; user interaction; event; command dispatch; query/projection; asynchronous operation; execution interaction; scheduler interaction; offline/sync interaction; conflict interaction; error/recovery; confirmation; navigation; forms; optimistic UI; process restoration; concurrency; idempotent UI actions; accessibility; stylus/touch; keyboard; notification; ViewModel; component interaction. D08A tidak mengubah authority yang telah ditetapkan D07, D07A, D07B, maupun D08.

## 2. Core Principle
```
DOMAIN STATE → APPLICATION STATE → PRESENTATION STATE → UI
Sedangkan interaction berjalan sebaliknya:
USER → UI EVENT → VIEWMODEL → COMMAND → APPLICATION SERVICE → DOMAIN
```
UI tidak boleh melakukan:
```
UI
 ├── mutate domain directly       ❌
 ├── mutate repository            ❌
 ├── mutate SyncQueue             ❌
 ├── execute Android API          ❌
 ├── resolve conflict             ❌
 └── invent domain state          ❌
```

## 3. State Ownership
| State | Owner |
|-------|-------|
| Execution state | D07 |
| Scheduler state | D07A |
| Sync state | D07B |
| Memory state | D05 |
| Android state | D06 |
| Domain state | Domain/Application |
| Presentation state | D08A |
| Component ephemeral state | UI component |
| Navigation state | UI |
| Form draft | UI/ViewModel |
| Modal state | UI |
| Focus state | UI |

## 4. State Classification
**4.1 Domain State:** ExecutionStatus, SyncStatus, MemoryStatus, PermissionStatus, TaskStatus — memiliki business meaning.
**4.2 Application State:** CurrentUser, ActiveExecution, PendingOperations, AvailableTools, SystemConnectivity — hasil orkestrasi service.
**4.3 Presentation State:** isLoading, isRefreshing, isSubmitting, canCancel, canRetry, showConfirmation, errorMessage — khusus rendering.
**4.4 Ephemeral UI State:** focusedField, openMenu, selectedTab, drawerOpen, modalOpen, hoveredItem — tidak boleh menjadi source of truth domain.

## 5. State Naming
State harus menggunakan vocabulary domain resmi. Benar: `syncStatus: "PENDING", executionStatus: "RUNNING"` — Tidak: `syncStatus: "almostDone"` — Presentation flags boleh: `canRetry, showConflict, isSubmitting`

## 6. State Machine Contract
Generic interaction:
```
IDLE → INTENT → VALIDATING → SUBMITTING → OBSERVING → SUCCESS / ERROR
```
Tidak semua operation wajib melewati seluruh state secara eksplisit, tetapi transition semantics harus konsisten.

## 7. User Intent
User action direpresentasikan sebagai intent. Contoh: ExecuteTask, CancelTask, PauseTask, RetryTask, SendMessage, CreateMemory, OpenTool, OpenAndroidApp, ResolveConflict — Intent belum merupakan domain mutation.

## 8. UI Event
UI event adalah event lokal: ButtonPressed, FormChanged, FormSubmitted, DialogConfirmed, DialogCancelled, TabChanged, SearchChanged, ScrollReachedEnd — Event → Intent. Contoh: `ButtonPressed("cancel") → CancelTaskIntent(taskId)`

## 9. Command Dispatch
Flow resmi:
```
UI Event → Intent → Validation → Command → Application Facade → Domain Service
```
UI tidak membuat database mutation.

## 10. Query Contract
Read flow:
```
UI → Query → Application Facade → Service / Repository → Projection → ViewModel → UI
```
Query harus: read-only; tidak mengubah domain state; dapat diulang; aman untuk refresh.

## 11. ViewModel Contract
ViewModel mempunyai dua tugas utama: `Domain/Application State → Presentation State` dan `UI Event → Command / Query` — ViewModel tidak boleh menjadi mini-domain-engine.

## 12. Presentation State
Contoh:
```typescript
interface ExecutionViewState {
  executionId: string; title: string; status: string;
  progress: number; startedAt: string; completedAt?: string;
  isLoading: boolean; isSubmitting: boolean;
  canPause: boolean; canResume: boolean; canCancel: boolean; canRetry: boolean;
  error?: { message: string; category: string };
}
```
`canPause, canCancel, canRetry` adalah derived presentation state. Authority tetap pada service/domain.

## 13. Execution Interaction
```
RUNNING → Pause → PauseTask / Cancel → CancelTask
PAUSED → Resume → ResumeTask
FAILED → Retry → RetryTask
```
UI tidak langsung mengubah `RUNNING → PAUSED` — Sebaliknya: `PauseTask → D07 → actual state → projection → UI`

## 14. Scheduler Interaction
D07A memiliki authority terhadap: queue, scheduling, concurrency, retry timing, backoff, dispatch timing. UI hanya: Schedule request, Cancel request, Pause request, Resume request — UI tidak menghitung nextRetryAt, backoff, concurrencySlot.

## 15. Sync Interaction
D07B authority: PENDING, SENDING, SYNCED, FAILED, CONFLICT, RETRYING
UI projection: PENDING→Saved locally, SENDING→Syncing, SYNCED→Synced, FAILED→Sync attention, CONFLICT→Needs review — Mapping presentation tidak mengubah domain state.

## 16. Offline Interaction
Ketika offline: `NETWORK_LOST → D06 → D07B → Sync state → UI projection` — UI menampilkan `Saved locally — waiting for connection.` — UI tidak mengubah NETWORK_AVAILABLE.

## 17. Online Recovery
`NETWORK_AVAILABLE → D06 event → D07B drain → Queue processing → Projection update` — UI hanya observe.

## 18. Conflict Interaction
```
SYNCING → CONFLICT → ConflictResolver → RECONCILED
UI: CONFLICT → display → user review if required → ResolveConflict command
```
UI tidak menentukan winner.

## 19. Error State
Error memiliki: category, code, message, retryable, recoverable — Namun retryable berasal dari service/domain. UI hanya: `retryable=true → show Retry`

## 20. Recovery
Pattern:
```
ERROR → RETRY / EDIT / CANCEL / DISMISS
```
Tidak semua error memiliki semua action. Action ditentukan application contract.

## 21. Confirmation Flow
Dangerous action:
```
INTENT → POLICY CHECK → REQUIRES_CONFIRMATION → CONFIRMATION UI → Cancel / Confirm → Command
```
UI tidak menentukan apakah operation berbahaya.

## 22. Double Submission Protection
UI harus mencegah duplicate interaction:
```
Submit → isSubmitting=true → Disable duplicate submit → Observe result
```
Tetapi ini hanya UX protection. Idempotency sebenarnya tetap berasal dari application/domain layer dan D07B.

## 23. Idempotent UI Actions
Action yang dapat diulang harus memiliki semantic safety. Contoh: Retry, Refresh, Sync, Execute — UI tidak membuat idempotency key. Untuk mutation yang masuk D07B: `Application Layer → stable idempotencyKey`

## 24. Race Conditions
Contoh: User clicks Cancel twice → UI: first→submitting, second→ignored/disabled — Jika race tetap terjadi: Domain/Application Layer menentukan outcome. UI tidak menyelesaikan race condition domain.

## 25. Stale View
Jika UI menerima state lama: Current Version 12, Incoming Version 11 → UI tidak overwrite secara membabi buta. Projection layer harus menggunakan freshness/version semantics dari application layer.

## 26. Optimistic UI
Optimistic UI hanya diperbolehkan untuk presentation state. Contoh valid: Button clicked → button disabled — Contoh tidak valid: UI says "Task completed" sebelum domain menyatakan completed. Untuk offline mutation: Local commit successful → UI may say "Saved locally" — Ini merupakan contract D07B.

## 27. Form State
Form terdiri dari: initial, dirty, valid, invalid, submitting, submitted, error
```
FORM_INITIAL → FORM_DIRTY → FORM_VALID → SUBMITTING → SUCCESS
```
Validation UI tidak menggantikan domain validation.

## 28. Draft Persistence
Draft dapat disimpan secara lokal jika diperlukan. Namun: Draft ≠ Domain Mutation — Draft tidak otomatis menjadi SyncQueue item sampai application command berhasil diproses.

## 29. Navigation State
Navigation state adalah UI-owned: currentRoute, currentTab, selectedExecution, selectedTool — Navigation tidak boleh mengandung credential atau sensitive payload.

## 30. Modal State
Modal: CLOSED → OPEN → SUBMITTING → CLOSING — Modal tidak boleh mengubah domain state hanya karena dibuka.

## 31. Drawer / Sheet State
CLOSED → OPENING → OPEN → CLOSING — Gesture cancellation harus aman.

## 32. Search Interaction
Search: `IDLE → INPUT → DEBOUNCING → QUERYING → RESULT` — Debounce adalah presentation optimization. Search result tetap harus berasal dari query authority.

## 33. Pagination
Pagination state: INITIAL, LOADING, LOADED, LOADING_MORE, EXHAUSTED, ERROR — UI tidak boleh menduplikasi item berdasarkan response race.

## 34. Refresh
Pull-to-refresh: `IDLE → REFRESHING → UPDATED` — Refresh tidak boleh membuat duplicate mutation.

## 35. Process Death
Setelah process mati:
```
App restarted → Restore UI navigation → Query authoritative state → Rebuild presentation state
```
UI tidak boleh menganggap previous "RUNNING" sebagai fakta. State harus direhydrate dari authority.

## 36. Execution Restoration
Previous UI: RUNNING — Process death — Restart → GetExecution(id) → D07 authoritative state → Render current state

## 37. Sync Restoration
Previous UI: SYNCING — Process death — Restart → D07B queue recovery → PENDING/SENDING recovery → Projection — D07B tetap menangani SENDING→PENDING sesuai contract-nya.

## 38. Component Interaction
Component tidak boleh langsung berkomunikasi dengan repository.
```
Component → Callback / Event → ViewModel → Command
Contoh: <CancelButton onClick={() => emit(CancelTaskIntent(id))} />
```

## 39. Parent / Child State
Parent memiliki domain-facing state. Child menerima: props, callbacks, presentation data — Child tidak boleh mengambil alih domain authority.

## 40. Global UI State
Global state dibatasi pada: CurrentUser, ConnectivityProjection, Theme, Navigation, GlobalNotifications, ApplicationPreferences — Jangan menjadikan global store sebagai second database, second execution engine, second sync engine.

## 41. Event Bus
Event bus hanya digunakan untuk cross-cutting UI/application events. Contoh: EXECUTION_UPDATED, SYNC_STATUS_CHANGED, NOTIFICATION_CREATED, AUTH_STATE_CHANGED — Event harus memiliki: eventId, timestamp, type, payload — Sensitive data harus diminimalkan.

## 42. Event Ordering
UI tidak boleh mengasumsikan semua event global memiliki ordering domain. Untuk domain ordering gunakan authority terkait: Execution→D07, Scheduler→D07A, Sync→D07B, Journal→D07B/domain

## 43. Accessibility Interaction
Setiap interactive element harus memiliki: accessible name, role, state, action, focus behavior — Keyboard navigation tidak boleh menjadi satu-satunya mechanism.

## 44. Stylus Interaction
Stylus: tap, drag, scroll, write, select harus menghasilkan event yang konsisten dengan touch. Pressure/hover tidak boleh menjadi dependency untuk core functionality.

## 45. Keyboard Interaction
Global: `Ctrl+K → Command Palette, Ctrl+/ → Search, Ctrl+Enter → Submit, Esc → Cancel/Close` — Shortcut harus: dapat dinonaktifkan jika conflict; tidak mengganggu text input; menghormati accessibility.

## 46. Notification Interaction
Notification: received → displayed → user action → route / command — Contoh: Sync conflict detected → Open Conflict → Conflict Detail

## 47. Toast Contract
Toast hanya untuk feedback ringan: Saved locally, Copied, Updated, Sync started — Error kritis tidak boleh hanya menggunakan toast.

## 48. Dialog Contract
Dialog digunakan untuk: destructive action; confirmation; conflict decision; permission explanation; critical error. Tidak digunakan untuk setiap notification.

## 49. Accessibility + State
State tidak boleh hanya dibedakan dengan warna. Contoh: `● Synced` harus memiliki semantic label: `Sync status: Synced`

## 50. UI Transition Restrictions
Forbidden:
```
UI → RUNNING→COMPLETED ❌
UI → PENDING→SYNCED ❌
UI → CONFLICT→REMOTE_WINS ❌
UI → FAILED→RETRYING ❌
Correct:
UI Command → Authority → State transition → Projection → UI
```

## 51. Command Lifecycle
```
CREATED → DISPATCHED → ACCEPTED → OBSERVING → COMPLETED / REJECTED
```
UI tidak boleh menganggap DISPATCHED = COMPLETED.

## 52. Query Lifecycle
```
REQUESTED → LOADING → RESULT → SUCCESS / ERROR
```
Caching boleh digunakan tetapi tidak boleh melanggar freshness contract.

## 53. Stale Data Indicator
Jika projection diketahui stale: `Last updated: 2 minutes ago` atau `Updating…` — UI tidak boleh menyamarkan stale state sebagai current authoritative state.

## 54. Offline Read
Read operation dapat menggunakan local projection ketika offline jika tersedia. UI harus dapat membedakan: `Available locally` dari `Confirmed remotely` jika semantics relevan.

## 55. Offline Write
Write:
```
Command → Local Repository → Outbox → PENDING
UI: Saved locally — Waiting for sync
```

## 56. Sync Failure
```
PENDING → SENDING → FAILED
UI: Couldn't sync — Your local data is safe. — Retry button hanya jika service menyatakan retryable.
```

## 57. Authentication Recovery
Jika D07B mengembalikan 401 — UI tidak mengelola token. Flow: D07B → D06 authentication boundary → Re-auth → retry once → result — UI hanya menerima projection: `Authentication required` bila user interaction diperlukan.

## 58. Permission Recovery
Permission denied → UI explains → User chooses Retry / Cancel — Actual permission state berasal dari D06.

## 59. Component Contract
Komponen harus: deterministic terhadap props/state; tidak memiliki domain authority; tidak melakukan side effect tersembunyi; expose explicit events; mendukung accessibility; dapat diuji secara isolated.

## 60. Side Effect Rule
Side effect: network, database, Android API, SyncQueue, execution tidak boleh dilakukan oleh presentational component. Gunakan: ViewModel, Application Service, Integration Service

## 61. Testing Contract
D08A wajib dapat diuji melalui: Unit (Intent→Command, Domain→Presentation), Integration (Command→Service→Projection), UI (User interaction→expected presentation), Recovery (Process death→restoration), Offline (Offline→local success→pending sync)

## 62. Race Test
Minimum test: double click, rapid retry, cancel while running, pause while cancelling, refresh while syncing, navigate during execution, process death during mutation

## 63. D08A Acceptance Criteria
- UIA-001 UI state tidak menjadi domain authority
- UIA-002 Domain state selalu berasal dari authority layer
- UIA-003 User event diproses melalui ViewModel/Application boundary
- UIA-004 UI tidak direct repository access
- UIA-005 UI tidak direct SyncQueue mutation
- UIA-006 UI tidak direct Android API
- UIA-007 Execution transitions berasal dari D07
- UIA-008 Scheduler transitions berasal dari D07A
- UIA-009 Sync transitions berasal dari D07B
- UIA-010 Optimistic UI tidak boleh menciptakan false domain state
- UIA-011 Double submission terlindungi
- UIA-012 Race conditions tidak menyebabkan UI authority corruption
- UIA-013 Process death melakukan authoritative rehydration
- UIA-014 Offline write menampilkan local-success semantics
- UIA-015 Retry hanya tersedia berdasarkan service contract
- UIA-016 Conflict tidak di-resolve oleh presentation layer
- UIA-017 Authentication tidak dikelola UI
- UIA-018 Permission authority tetap di D06
- UIA-019 Stylus interaction tersedia
- UIA-020 Keyboard interaction tersedia
- UIA-021 Accessibility state tersedia
- UIA-022 Component tidak melakukan hidden side effects
- UIA-023 Presentation state dapat diuji secara deterministic
- UIA-024 Notification action menghasilkan command/query yang valid
- UIA-025 State restoration tidak menggunakan stale UI state sebagai authority

## 64. Traceability
```
D07 Execution State → D08A Execution Projection
D07A Scheduling State → D08A Scheduler Projection
D07B Sync State, Conflict, Offline → D08A Sync Projection
D06 Connectivity, Permission, Authentication → D08A Integration Projection
D05 Memory State → D08A Memory Projection
D08 Control Surface → D08A Interaction Contract
```

## 65. Final D08A Architecture
Kontrak akhirnya:
```
                    USER
                      │
                      ▼
              ┌───────────────┐
              │      D08      │
              │ Control       │
              │ Surface       │
              └───────┬───────┘
                      │
                UI Events
                      │
                      ▼
              ┌───────────────┐
              │     D08A      │
              │ State &       │
              │ Interaction   │
              └───────┬───────┘
                      │
                Commands / Queries
                      │
                      ▼
             Application Boundary
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
       D07           D05           D06
        │
       D07A
        │
       D07B
        │
        ▼
     External
Final Rule: D08 defines what the human can see and control. D08A defines how those interactions become UI state transitions and application requests. Neither layer owns the underlying domain state.
```

> Dengan ini D08A = READY FOR LOCK.
> Setelah D08A dikunci, arsitektur UI sudah memiliki dua lapisan yang jelas: D08 (Human Control Surface) → D08A (State + Interaction Contract) → D09 (Frontend Application Contract)
> Langkah berikutnya yang paling tepat adalah D09 — Frontend Application Contract, yang mulai menjembatani seluruh kontrak arsitektur ini ke struktur aplikasi frontend secara konkret: Application Facade, services, stores, ViewModels, repositories boundary, dependency injection, routing, feature modules, dan data-flow architecture, tanpa langsung masuk ke implementasi komponen.

