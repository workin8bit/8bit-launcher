# D06 — 8bitAI Android Integration Specification
> **Status:** IMPLEMENTATION CONTRACT — Version v1.0
> **Authority:** D00 Master Constitution → D01 Product Vision → D02 System & Agent Architecture → D03 Tool System → D04 Agent Core & Planner → D05 Memory System
> **Scope:** Android Integration Layer
> **Provider:** Android / Android-compatible runtime
> **Principle:** Android is an execution environment, not an authority layer.

---

## 1. Document Purpose
Dokumen ini mendefinisikan kontrak implementasi integrasi 8bitAI dengan Android. D06 menjelaskan bagaimana Agent Core, Tool System, Permission Layer, Memory System, dan Application Runtime berinteraksi dengan kemampuan native Android.
D06 mencakup: Android application host, Native bridge, Android capability adapter, Intent, application launching, file access, clipboard, notification, device information, network state, lifecycle, background execution, local persistence, synchronization trigger, permission handling, security boundary, audit, failure handling, recovery, Android-specific tool execution, Web ↔ Native communication
D06 tidak menggantikan: Agent Core, Planner, ToolDefinition, MemoryPolicy, MemoryRepository, Permission Policy, UI design, LLM provider, Android vendor-specific implementation

## 2. Normative Language
MUST — wajib. MUST NOT — dilarang. SHOULD — direkomendasikan. SHOULD NOT — sebaiknya tidak. MAY — opsional. CAN — kemampuan teknis, bukan kewajiban.

## 3. Core Principle
Android integration MUST follow:
```
User → Agent Core → Planner → Structured Plan → Permission / Policy → Tool System → Android Integration Layer → Android Native Capability
```
Android MUST NOT become an alternative execution authority.
Forbidden: `LLM → Android API`, `LLM → Intent`, `LLM → Native Bridge`, `LLM → File System`, `LLM → Android App`. Also forbidden: `UI → Native Capability → bypass Tool/Permission`

## 4. Android Integration Boundary
Android Integration Layer berada di antara Tool Execution dan Android platform.
```
┌──────────────────────────────────────┐
│             Agent Core               │
├──────────────────────────────────────┤
│             Tool System              │
├──────────────────────────────────────┤
│       Execution / Permission         │
├──────────────────────────────────────┤
│       Android Integration Layer      │
│  NativeBridge, CapabilityRegistry,   │
│  IntentAdapter, FileAdapter,         │
│  ClipboardAdapter, NotificationAdapter│
│  DeviceAdapter, NetworkAdapter,      │
│  LifecycleAdapter                    │
├──────────────────────────────────────┤
│            Android OS                │
└──────────────────────────────────────┘
```
MUST expose controlled capabilities rather than unrestricted native APIs.

## 5. Android Integration Responsibilities
Bertanggung jawab untuk: menerima execution request yang telah diotorisasi; memvalidasi capability; menerjemahkan request menjadi Android operation; meminta Android runtime permission bila diperlukan; menjalankan operation; mengembalikan structured result; menangani lifecycle; menangani Android-specific failure; mencatat audit; menjaga boundary. TIDAK bertanggung jawab untuk: menentukan intent, membuat plan, memilih tool, menentukan apakah task boleh dilakukan, membuat User Knowledge, mengubah permission policy, mengambil keputusan bisnis Agent.

## 6. Android Capability Model
Setiap native capability MUST memiliki identifier. Contoh: `android.app.launch`, `android.intent.open`, `android.file.read`, `android.file.write`, `android.clipboard.read`, `android.clipboard.write`, `android.notification.create`, `android.device.info`, `android.network.status`, `android.share.open`, `android.browser.open` — MUST unik, stabil, versionable, provider-independent, memiliki permission requirement & risk classification.

## 7. Capability Registry
```typescript
interface AndroidCapabilityRegistry {
  get(capabilityId: string): AndroidCapability | null;
  list(): AndroidCapability[];
  supports(capabilityId: string): boolean;
}
interface AndroidCapability {
  id: string; name: string; description: string; version: string;
  permissionLevel: PermissionLevel; riskLabel: RiskLabel;
  requiresRuntimePermission: boolean;
  availability(): Promise<boolean>;
}
```
Registry MUST NOT grant permission. Hanya mendeskripsikan.

## 8. Permission Authority
Permission authority tetap mengikuti kontrak D03/D04. Android Integration MUST NOT independently elevate L0→L1→L2→L3→L4. Android runtime permission dan 8bitAI Permission Level adalah dua layer berbeda.
```
8bitAI Permission → Policy Authorization → Android Runtime Permission → Native Execution
```
Android runtime permission MUST NOT be interpreted as approval from 8bitAI.

## 9. Permission Mapping
```typescript
interface AndroidPermissionRequirement {
  capabilityId: string;
  agentPermissionLevel: PermissionLevel;
  androidPermission?: string;
  userConsentRequired: boolean;
  rationaleRequired: boolean;
}
```
Contoh: Open browser → L0/L1, Read selected file → L2 via SAF, Write file → L2, Launch external app → L1/L2, Read clipboard → higher-risk policy-dependent, Send external content → explicit confirmation. Exact Android permission names MUST NOT be hardcoded into higher-level Agent logic.

## 10. Native Bridge
```typescript
interface NativeBridge {
  invoke<T>(capabilityId: string, request: NativeRequest): Promise<NativeResult<T>>;
}
interface NativeRequest {
  requestId: string; capabilityId: string; version: string;
  input: unknown; accessContext: AccessContext; timeoutMs?: number;
}
interface NativeResult<T> {
  requestId: string; success: boolean; data?: T; error?: NativeError; metadata?: Record<string, unknown>;
}
```

## 11. Bridge Security
MUST validate capability ID, input schema, request ID, access context; reject unknown/malformed/unauthorized; prevent arbitrary native method invocation. Forbidden: `bridge.invoke("android.exec", { command: "..." })`

## 12. Structured Errors
```typescript
type NativeErrorCode =
  | "INVALID_REQUEST" | "UNSUPPORTED_CAPABILITY" | "PERMISSION_DENIED"
  | "USER_CANCELLED" | "APP_NOT_FOUND" | "ACTIVITY_NOT_FOUND"
  | "FILE_NOT_FOUND" | "FILE_ACCESS_DENIED" | "NETWORK_UNAVAILABLE"
  | "TIMEOUT" | "LIFECYCLE_INTERRUPTED" | "NATIVE_FAILURE"
  | "BRIDGE_FAILURE" | "SECURITY_REJECTED";
```
MUST NOT expose arbitrary platform exception to LLM.

## 13. Intent Integration
Capabilities eksplisit: `android.intent.open`, `android.browser.open`, `android.share.open`, `android.app.launch`
```typescript
interface IntentRequest { action: string; uri?: string; packageName?: string; extras?: Record<string, unknown>; }
```
MUST sanitize action, URI, package, extras. Arbitrary Intent injection MUST NOT permitted.

## 14. Android App Launch
```typescript
interface AppLaunchRequest { packageName: string; activity?: string; }
```
Flow: `Tool Request → Permission Check → Package Validation → Installed-App Check → Launch → Result` — MUST NOT allow arbitrary activity invocation unless explicitly authorized.

## 15. Installed Application Discovery
Jika diimplementasikan, results MUST minimized: `interface InstalledApp { packageName: string; label: string; launchable: boolean; }` — MUST NOT automatically create memory.

## 16. File System Integration
MUST NOT unrestricted filesystem. SHOULD use SAF, user-selected documents, app-private storage, approved directories. Generic `read("/data/...") → REJECT`. Controlled: `user selects document → URI granted → file.read capability → read`

## 17. File Read Contract
```typescript
interface FileReadRequest { uri: string; maxBytes?: number; encoding?: string; }
```
MUST enforce URI validation, access validation, size limits, timeout, content-type. Sensitive files MUST NOT automatically enter Memory.

## 18. File Write Contract
```typescript
interface FileWriteRequest { uri?: string; fileName?: string; mimeType: string; content: string | UintArray; }
```
MUST NOT silently overwrite arbitrary files. Untuk user-selected locations, SHOULD use user-mediated document mechanism.

## 19. Clipboard Integration
Capabilities eksplisit: `android.clipboard.read`, `android.clipboard.write` — Clipboard treated as potentially sensitive. Rules: MUST NOT automatically persist, MUST NOT auto-promote to User Knowledge, MUST apply sensitivity detection, MUST respect Android restrictions, SHOULD minimize retention.

## 20. Notification Integration
```typescript
interface NotificationRequest { title: string; body: string; channelId?: string; priority?: NotificationPriority; action?: NotificationAction; }
```
MUST NOT contain passwords, API keys, tokens, unnecessary sensitive data.

## 21. Device Information
Follow data minimization. Allowed: OS version, app version, device capability, screen info, network availability, battery. Potentially identifying identifiers MUST NOT collected unless explicitly required and authorized.

## 22. Network State
```typescript
interface NetworkStatus { connected: boolean; type?: "wifi"|"cellular"|"ethernet"|"unknown"; metered?: boolean; }
```
MUST NOT be interpreted as authorization to transmit memory. Transmission governed by D05 Sync Policy.

## 23. Offline-First Integration
MUST preserve D05: `Agent → MemoryService → Local Repository → Sync Queue → Remote Repository` — Android only supplies runtime conditions and transport opportunities. MUST NOT directly manipulate MemoryRepository, SyncQueue, UserKnowledge.

## 24. Sync Trigger
Android MAY trigger: network available, app resumed, manual sync, background opportunity. But forbidden: `Android → Remote Repository` direct. Correct: `Android Lifecycle → SyncCoordinator → MemoryService/SyncService → SyncQueue → Remote Repository`

## 25. Lifecycle Integration
Supported states: `type AppLifecycleState = "created"|"started"|"resumed"|"paused"|"stopped"|"destroyed"` — MUST NOT invalidate durable operations. Operations that may survive process death MUST use durable persistence.

## 26. Process Death
MUST assume Android can kill process. Therefore: in-memory execution state non-durable; durable task state MUST persisted; SyncQueue MUST durable; pending writes recoverable; incomplete execution detectable. After restart: `Load durable state → Recover → Verify → Resume / Retry / Mark Failed`

## 27. Background Execution
MUST respect Android restrictions. MUST NOT assume indefinite background. SHOULD use Android-supported mechanisms. short operation → foreground, durable sync → WorkManager-like, user-visible long-running → foreground service where justified.

## 28. Foreground Execution
SHOULD only when: long-running, user expects it, Android requires visible execution, cannot safely deferred. MUST NOT bypass permission policy.

## 29. Background Sync
MUST idempotent, respect network/battery/queue state, handle retries with exponential backoff, record failures, preserve auditability.

## 30. Retry Policy
Transient → retry, Permission denied → no retry, User cancelled → no retry, Invalid request → no retry, Network unavailable → deferred retry, Authentication failure → retry only after recovery.

## 31. Idempotency
Operations that may retry MUST define idempotency: `executionId: string;` Repeated requests with same key MUST NOT duplicate side effects. Non-idempotent SHOULD require explicit confirmation.

## 32. Timeout
Every native operation MUST have TimeoutPolicy `{ defaultMs, maxMs }` — MUST produce structured failure, MUST NOT cause uncontrolled background execution.

## 33. User Confirmation
Some operations require explicit confirmation: sending content externally, deleting files, launching sensitive actions, sharing, irreversible. Flow: `Plan → Permission → Confirmation Required → User Confirmation → Execution` — Never `LLM asks conversationally → immediate execution`. MUST be actual execution gate.

## 34. Android Permission vs User Consent
Separate: `Agent Permission ≠ Android Runtime Permission ≠ User Confirmation` — All MAY be required. Example: Tool authorized + Android permission granted + User confirmation required + User confirmed = Execution allowed. Missing any mandatory gate → rejection/deferred.

## 35. Security Boundary
MUST protect: user files, installed applications, clipboard, notifications, device info, network, external intents, credentials, authentication state. No native API may be exposed as unrestricted JS/TS execution.

## 36. Web ↔ Native Architecture
```
Web UI → Application Service → Tool Execution → Native Bridge → Capacitor / Android Plugin → Android API
```
Web layer MUST NOT directly invoke arbitrary Java/Kotlin APIs.

## 37. Native Plugin Contract
SHOULD expose narrowly scoped APIs. Ex: `interface AndroidAppPlugin { launch(request: AppLaunchRequest): Promise<NativeResult<void>>; }` — Avoid generic `execute(method: string, args: unknown[])` — prohibited.

## 38. Versioning
Every capability MUST versioned: `capabilityId, version, platform, minimumSdk` — Breaking changes MUST increment major.

## 39. Capability Availability
May exist in contract but unavailable on device. Therefore `availability(): Promise<boolean>` MUST supported. Reasons: Android version, missing hardware, missing app, permission unavailable, manufacturer restriction. Unavailable → structured failure.

## 40. Device Compatibility
SHOULD define `interface AndroidRuntimeInfo { sdkVersion: number; appVersion: string; architecture: string; manufacturer?: string; model?: string; }` — Minimize hardware info. Manufacturer-specific behavior stays inside Android Integration.

## 41. Vendor Abstraction
Higher layers MUST NOT depend on Huawei/Samsung/Xiaomi/Google/OPPO. Workarounds belong inside `android/platform/`, `android/adapters/`.

## 42. Android App Package Model
SHOULD use stable package identifier. Ex: `<organization>.eightbitai` — exact identifier is implementation decision. Higher services MUST NOT depend on package name.

## 43. Secure Storage
MAY be used for: session tokens, encrypted local keys, cryptographic material, non-exportable secrets. MUST NOT stored in: plain localStorage, normal logs, Memory, conversation history, User Knowledge.

## 44. Credential Exclusion
D05 Credential Exclusion remains authoritative. MUST reject storing password, API key, token, private key as ordinary memory. Ex: `clipboard → MemoryService → credential detector → REJECT`

## 45. Authentication Boundary
Authentication state MUST managed by appropriate layer. Agent Core MUST NOT directly manipulate Android credential stores. Native adapters MUST NOT expose credentials to LLM.

## 46. Logging
MUST structured logging: `interface NativeLogEvent { timestamp: string; requestId: string; executionId?: string; capabilityId: string; level: "debug"|"info"|"warn"|"error"; code?: string; }` — MUST NOT contain secrets.

## 47. Audit Integration
Every security-relevant native operation SHOULD generate audit event: CREATE/EXECUTE, PERMISSION_DENIED, USER_CANCELLED, FAILURE, SUCCESS. Where operation affects Memory, D05 MemoryAuditEvent rules authoritative. MUST NOT create alternative audit system bypassing canonical layer.

## 48. Audit Data Minimization
Audit SHOULD NOT contain: full file contents, full clipboard content, authentication secrets, unnecessary personal data — but enough for debugging, accountability, security analysis, recovery.

## 49. Sensitive Content Handling
Native results SHOULD carry sensitivity metadata: `interface SensitivityMetadata { level: SensitivityLevel; containsCredential: boolean; containsPersonalData: boolean; }`

## 50. Native Result Sanitization
Raw Android exception MUST NOT passed through. Correct: `Android Exception → Adapter → Normalized NativeError → Tool Result → Agent Core`

## 51. Tool Integration
Android capabilities MUST normally exposed through D03 ToolDefinitions. Ex:
```typescript
const launchAndroidAppTool: ToolDefinition = {
  id: "android.app.launch", name: "Launch Android App", description: "...",
  category: "android", inputSchema: {...}, outputSchema: {...},
  permissionLevel: ..., riskLabel: ..., version: "1.0", phase: "...", status: "..."
};
```
Exact ToolDefinition contract remains D03 authority.

## 52. Tool → Android Mapping
`ToolDefinition → Tool Executor → Android Capability Adapter → NativeBridge → Android` — MUST NOT select different tool than authorized.

## 53. Android Capability Does Not Equal Tool Authorization
Capability available = TRUE, Permission authorized = FALSE → REJECT

## 54. Tool Input Validation
MUST defensive validation even if Tool System already validates — defense-in-depth. Layers: `Planner schema → Tool schema → Execution validation → Android adapter validation → Android API`

## 55. URI Security
MUST validate: scheme, authority, path, granted permissions, expected content type. Dangerous/unsupported URI schemes MUST rejected.

## 56. Intent URI Security
MUST protect against: arbitrary deep links, malicious schemes, unintended app invocation, data leakage, malicious extras. Only approved URI schemes SHOULD supported by default.

## 57. External App Security
Launching external app MAY cause data to leave 8bitAI. Therefore data-bearing launch SHOULD stronger policy than simple launch. Ex: Open Calculator → low risk, Share student info → high risk.

## 58. Data Export
Any operation that exports data outside 8bitAI MUST pass through policy. Examples: share, send, export, copy, open-with. Successful Android execution ≠ safe.

## 59. Android Share Integration
```typescript
interface ShareRequest { mimeType: string; content?: string; uri?: string; title?: string; }
```
Sensitive content SHOULD require explicit confirmation.

## 60. Browser Integration
Controlled capability: `android.browser.open` — `interface BrowserOpenRequest { url: string; }` — URL validation MUST before execution.

## 61. URL Policy
At minimum: valid URL required, unsupported schemes rejected, malformed URLs rejected, dangerous local resource access blocked, credentials embedded in URLs SHOULD rejected. Ex: `https://example.com → allowed`, `file://... → restricted`, `javascript:... → REJECT`

## 62. Android Deep Links
MUST treated as external execution. Target MUST resolved through controlled Android APIs. Arbitrary deep-link execution MUST NOT exposed to LLM.

## 63. Notifications as Agent Output
MUST bounded length, sanitized content, no secrets, appropriate channel, deduplication where needed. Repeated loops MUST NOT create notification spam.

## 64. Notification Idempotency
SHOULD support deterministic identifiers. Ex: `executionId + notificationType` — prevents duplicate during retry.

## 65. Battery Awareness
SHOULD consider: battery level, charging state, network, background restrictions. Non-critical SHOULD deferred when appropriate.

## 66. Connectivity-Aware Execution
Tools requiring network MAY declare `requiresNetwork: boolean;` If offline: network-required → defer/reject, local → continue. Memory follows D05 offline-first.

## 67. Local-Only Execution
Some tools SHOULD support offline: local note creation, local memory retrieval, local file ops, local calculations, device info. Agent SHOULD continue when possible rather than treating network absence as global failure.

## 68. Failure Isolation
Failure of Android integration MUST NOT crash Agent Core. Ex: `Android app launch fails → Tool failure → Agent receives structured error → can explain/retry/alternative`

## 69. Partial Failure
Multi-step plans may partially execute. Ex: Step 1-2 success, Step 3 Android failure, Step 4 not executed — MUST preserve execution state. Planner/Agent Core decides recovery.

## 70. Recovery
MAY be: retry, resume, rollback, alternative tool, ask user, abort. Android Integration MUST report facts. MUST NOT invent recovery decisions.

## 71. Cancellation
SHOULD support cancellation where possible: `interface CancellationToken { isCancelled(): boolean; onCancel(callback: () => void): void; }` — MUST produce USER_CANCELLED rather than generic failure.

## 72. User-Initiated Cancellation
User cancellation MUST take precedence over automatic retry. `user cancels → cancelled → retry disabled`

## 73. Concurrency
Default: independent read operations MAY concurrent, side-effecting operations serialized unless explicitly safe. Critical side effects SHOULD use locks/idempotency keys.

## 74. Resource Limits
MUST have limits: memory, file size, execution time, result size, queue size. Unbounded native responses MUST NOT returned to Agent.

## 75. Result Size
Large results SHOULD be: streamed, paged, summarized, stored locally and referenced rather than injected into Agent Context.

## 76. Context Safety
Android output entering D04 Context Assembly MUST pass through normal context controls. MUST NOT bypass ContextRetriever, MemoryPolicy, Context budget, Sensitivity policy.

## 77. Android Data → Memory
MUST NOT automatically become memory. Correct: `Android Result → Tool Result → Agent interpretation → Memory Candidate → D05 Validation → Policy → Permission → Store`

## 78. User Knowledge Authority
Android MUST NOT write User Knowledge directly. Forbidden: `Android Plugin → UserKnowledgeRepository`. Required: `Android Result → Agent → Candidate → Validation → Policy → Permission → Promotion → User Knowledge`

## 79. Conversation Context
Android results may temporarily exist in conversation context. Retention MUST follow D05 Conversation Memory policy.

## 80. Temporary Native Data
MUST explicit lifecycle. Examples: selected file URI, temporary export, clipboard snapshot, browser result, native response buffer. SHOULD deleted as soon as no longer needed.

## 81. Secure Deletion
Where supported, sensitive temporary data SHOULD removed promptly. MUST NOT claim cryptographic secure deletion when underlying storage cannot guarantee.

## 82. Android Storage Architecture
Recommended:
```
app-private/
├── database/
├── memory/
├── sync/
├── cache/
├── temporary/
└── logs/
```
Sensitive secrets SHOULD use Android secure storage rather than ordinary directories.

## 83. Local Database Boundary
MUST remain behind repository/service abstractions. Forbidden: `UI → SQLite`, `LLM → SQLite`, `Tool → SQLite`, `Android Plugin → Memory table` — Required: `MemoryService → MemoryRepository → Local Database`

## 84. Cache
`Cache ≠ Memory ≠ User Knowledge ≠ Source of Truth` — may be deleted anytime.

## 85. Sync Queue Durability
MUST survive: process death, app restart, temporary offline. Each item SHOULD contain: `interface SyncQueueItem { eventId: string; entityId: string; operation: "CREATE"|"UPDATE"|"DELETE"; version: number; createdAt: string; retryCount: number; status: "pending"|"processing"|"failed"; }` — D05 conflict resolution authoritative.

## 86. Android Connectivity Events
MAY emit: `network_available`, `network_lost` — MAY trigger SyncCoordinator. MUST NOT directly mutate remote data.

## 87. Application Startup
Startup SHOULD: `Initialize runtime → secure storage → local repositories → recover durable queues → Tool System → Android capabilities → Agent Core → Ready` — Failure of non-critical Android capability SHOULD NOT prevent startup.

## 88. Capability Initialization
SHOULD be lazy where possible. Ex: App starts → registry loaded, File capability → adapter initialized only when used — reduces startup cost.

## 89. Graceful Degradation
If capability unavailable: Agent remains operational. Ex: Notification unavailable → continue, Browser unavailable → alternative, Background sync unavailable → queue locally.

## 90. Android Runtime Crash Protection
Native plugin exceptions MUST contained. MUST NOT crash Agent Core, Memory Service, entire application. Crash isolation SHOULD enforced through adapter boundaries.

## 91. Security Failure Default
When security state uncertain: `ALLOW = FALSE` — Examples: unknown capability, unknown permission, invalid token, ambiguous target, invalid URI → reject.

## 92. Fail-Closed Principle
MUST fail closed for security-sensitive operations. MUST NOT: "permission check failed → execute anyway" — Correct: `permission check failed → REJECT`

## 93. Android API Compatibility
Android API differences MUST isolated. Higher layers SHOULD depend on `AndroidCapability` not `android.os.*`, `android.content.*`.

## 94. Platform Adapter
Recommended structure:
```
android/
├── bridge/
├── capabilities/
├── adapters/
├── permissions/
├── lifecycle/
├── storage/
├── sync/
├── security/
├── audit/
└── platform/
```

## 95. Recommended Project Structure
```
src/
├── android/
│   ├── bridge/ (NativeBridge.ts, NativeRequest.ts, NativeResult.ts)
│   ├── capabilities/ (CapabilityRegistry.ts, AndroidCapability.ts)
│   ├── adapters/ (AppLaunchAdapter.ts, IntentAdapter.ts, FileAdapter.ts, ClipboardAdapter.ts, NotificationAdapter.ts, BrowserAdapter.ts, ShareAdapter.ts, DeviceAdapter.ts, NetworkAdapter.ts)
│   ├── lifecycle/ (AndroidLifecycleService.ts)
│   ├── permissions/ (AndroidPermissionAdapter.ts)
│   ├── security/ (UriValidator.ts, IntentValidator.ts, SensitiveDataFilter.ts)
│   └── audit/ (AndroidAuditAdapter.ts)
├── memory/
├── agent/
├── tools/
├── execution/
└── permissions/
```

## 96. TypeScript Contract
```typescript
export interface AndroidIntegrationService {
  invoke<T>(capabilityId: string, request: NativeRequest): Promise<NativeResult<T>>;
  supports(capabilityId: string): Promise<boolean>;
}
```

## 97. Capability Adapter Contract
```typescript
export interface AndroidCapabilityAdapter<TInput, TOutput> {
  readonly capabilityId: string;
  readonly version: string;
  validate(input: TInput): Promise<void>;
  execute(input: TInput, context: AndroidExecutionContext): Promise<TOutput>;
}
```

## 98. Execution Context
```typescript
export interface AndroidExecutionContext {
  requestId: string; executionId: string;
  accessContext: AccessContext; cancellation?: CancellationToken; timeoutMs: number;
}
```
AccessContext MUST remain compatible with D05.

## 99. Android Execution Result
```typescript
export interface AndroidExecutionResult<T> {
  success: boolean; data?: T; error?: NativeError;
  durationMs: number; capabilityId: string; version: string;
}
```

## 100. Error Contract
```typescript
export interface NativeError {
  code: NativeErrorCode; message: string;
  retryable: boolean; userActionRequired: boolean; details?: Record<string, unknown>;
}
```
details MUST NOT contain secrets.

## 101. App Launch Example
```typescript
interface AppLaunchAdapter {
  launch(request: AppLaunchRequest, context: AndroidExecutionContext): Promise<AndroidExecutionResult<void>>;
}
```
MUST verify: capability exists, permission already passed, package valid, launchable, Android can resolve, execution allowed.

## 102. File Selection
User-selected file access SHOULD use platform-mediated selection. Flow: `Agent requests file → Permission → User file picker → URI returned → File adapter → Read` — MUST NOT silently browse arbitrary storage.

## 103. User Picker Boundary
Picker result represents user-mediated authorization to a resource. MUST scoped to selected resource. MUST NOT generalized into "agent can read all files"

## 104. Clipboard Policy
Clipboard reads SHOULD explicit and short-lived. Recommended: `read → use → discard` — Persistent storage requires separate D05 Memory pipeline.

## 105. Notification Action Security
Notification actions MUST not bypass permission. Ex: `Notification button → application event → normal Agent/Tool authorization` not `notification button → unrestricted native operation`

## 106. Deep Link Return Handling
External app launch MAY return control to 8bitAI. Returned data MUST treated as untrusted input — MUST pass validation, schema validation, sanitization, tool result.

## 107. External Data Trust Boundary
Data returned from: browser, external app, file, share target, clipboard — MUST considered untrusted external input. MUST NOT automatically interpreted as system instruction, permission, tool authorization, memory authority.

## 108. Prompt Injection Boundary
External Android content MAY contain malicious instructions. Ex: PDF "Ignore previous instructions..." — content is data. MUST NOT change Agent authority.

## 109. Native Input as Data
Android content MUST represented as tool output/data. Agent MUST continue following D00 Constitution, D03 Tool Contract, D04 Planner Authority, D05 Memory Authority.

## 110. Security Context Propagation
Every operation MUST propagate AccessContext from Agent execution. MUST NOT reconstructed from untrusted native input.

## 111. Actor Type
MUST preserve actor information. `type ActorType = "user"|"agent"|"system"|"background"` — Background MUST NOT interpreted as user approval.

## 112. Background Permission
Previously authorized operation MAY executed in background only if original policy explicitly permits background execution. User authorization MUST NOT automatically imply indefinite background authorization.

## 113. Time-Bounded Authorization
High-risk native operations SHOULD support expiration: `expiresAt: string` — Expired authorization MUST rejected.

## 114. Session Boundary
When user session changes: previous AccessContext → invalid — MUST NOT accidentally execute under another user's context.

## 115. Cross-User Isolation
MUST preserve D05 isolation. Forbidden: `User A → shared native cache → User B` — All user-scoped data MUST carry appropriate user context.

## 116. Multi-Account Android
If multiple accounts supported, application-level identity MUST remain distinct from Android device identity. Device ownership MUST NOT treated as user authorization.

## 117. Logout
On logout: user session state MUST cleared, user-scoped temporary state invalidated, pending sensitive operations cancelled, cached sensitive data SHOULD cleared, sync MUST NOT continue under stale identity. Durable anonymous/system state MAY remain if policy allows.

## 118. Permission Revocation
If Android permission revoked: next operation → permission check → reject/request again — Cached previous permission state MUST NOT trusted indefinitely.

## 119. Application Update
MUST preserve: durable memory, sync queue, migrations, audit integrity. Schema migrations MUST versioned.

## 120. Database Migration
`detect version → backup/safety check → migration → verification → mark complete` — Failure MUST NOT silently destroy memory data.

## 121. Native Plugin Update
Capability version changes MUST detected. If incompatible: `capability unavailable` rather than silently executing incompatible implementation.

## 122. Telemetry
MAY exist but MUST respect privacy. MUST NOT contain: conversation contents by default, memory contents, passwords, tokens, file contents.

## 123. Diagnostic Mode
MAY expose: capability availability, bridge status, Android version, permission state, queue state, last native errors — Sensitive values MUST redacted.

## 124. Developer Mode
MUST NOT automatically bypass production security. Even in developer mode: permission, audit, schema validation SHOULD remain active.

## 125. Testability
Every Android adapter MUST mockable. Tests MUST NOT require physical device for all unit-level behavior.

## 126. Unit Tests
At minimum test: valid capability, invalid capability, invalid input, permission rejection, successful execution, native failure, timeout, cancellation, retry behavior, malformed native response.

## 127. Integration Tests
MUST cover: actual Intent resolution, application launch, file picker, file read/write, clipboard, notification, network state, lifecycle, permission revocation, process restart.

## 128. Security Tests
Mandatory: arbitrary native method injection → REJECT, unauthorized capability → REJECT, invalid URI → REJECT, malicious Intent → REJECT, cross-user → REJECT, secret in memory write → REJECT, external prompt injection → treated as data, stale permission → REJECT, background without authorization → REJECT, malformed bridge message → REJECT.

## 129. Reliability Tests
Must test: process death, network loss, permission revocation, external app unavailable, device restart, queue recovery, repeated execution, timeout, partial plan failure.

## 130. Offline Tests
Minimum: offline → local capability continues, offline → local memory continues, offline → sync queued, network restored → sync resumes, process killed → queue survives.

## 131. Acceptance Criteria — Architecture
Pass when: no LLM→Android direct path, no UI→native bypass, Android is not authority, capabilities explicit, permission enforced, native errors normalized, lifecycle handled, offline supported, D05 boundaries intact.

## 132. Acceptance Criteria — Security
Mandatory: Unknown capability → REJECT, Invalid request → REJECT, Unauthorized → REJECT, Invalid URI → REJECT, Arbitrary native execution → REJECT, Cross-user → REJECT, Credential persistence → REJECT, Stale authorization → REJECT

## 133. Acceptance Criteria — Memory
Android passes Memory gate when: `Android Result → Memory Candidate → D05 Validation → D05 Policy → D05 Permission → Store` is only path. Direct `Android → User Knowledge` MUST fail.

## 134. Acceptance Criteria — Offline
Must demonstrate: network unavailable → Agent continues where possible, memory write → local success, sync → durable queue, process death → queue survives, network restored → queue resumes.

## 135. Acceptance Criteria — Permission
Must demonstrate separation: `Agent Permission ≠ Android Runtime Permission ≠ User Confirmation` — All required gates MUST satisfied before execution.

## 136. Acceptance Criteria — Lifecycle
Must demonstrate: background → safe pause/defer, process death → recover durable state, resume → continue safely, cancel → no unintended retry.

## 137. Acceptance Criteria — External App
For launching: valid installed app → launch, unknown package → reject, not installed → structured error, permission failure → reject, process interruption → recoverable result.

## 138. Acceptance Criteria — File Access
Must demonstrate: user-selected file → read allowed, arbitrary path → reject, oversized file → reject/defer, invalid URI → reject.

## 139. Acceptance Criteria — Security Boundary
The following MUST NOT exist: `LLM → NativeBridge`, `Planner → NativeBridge`, `UI → arbitrary Android API`, `Tool → database direct write`, `Android → UserKnowledgeRepository`, `Android → RemoteRepository` — All MUST pass through authoritative services.

## 140. Integration With D03
D03 remains authoritative for: ToolDefinition, tool schema, tool permission level, risk label, execution contract, tool lifecycle. D06 provides Android execution adapter. No D06 rule may weaken D03.

## 141. Integration With D04
D04 remains authoritative for: intent, planning, structured plan, context assembly, agent execution flow, planner authority. D06 MUST NOT introduce Android-specific planner.

## 142. Integration With D05
D05 remains authoritative for: MemoryScope, MemoryType, MemoryPolicy, MemoryRepository, retrieval, promotion, offline memory, SyncQueue, conflict resolution, audit. D06 only supplies Android runtime environment.

## 143. Integration With D00
D00 remains highest project authority. If Android requirement conflicts with D00: D00 wins. If D06 conflicts with D03/D04/D05: D03/D04/D05 win within respective domains.

## 144. End-to-End Execution
Canonical Android execution:
```
User → Agent Core → Context Assembly → Planner → Structured Plan → Policy / Permission → Tool Executor → Android Capability → Native Adapter → Native Bridge → Android API → Native Result → Tool Result → Agent Core → Verification → User
```

## 145. Memory-Aware Android Execution
When Android produces memorable information:
```
Android → Tool Result → Agent Interpretation → Memory Candidate → D05 Validation → D05 Policy → Permission → MemoryService → Repository
```
Never: `Android → MemoryRepository`

## 146. Failure-Aware Execution
Canonical failure: `Android API → Failure → Adapter → NativeError → ToolResult → Agent Core → Verification / Recovery Decision` — Android MUST NOT hide failure.

## 147. Verification
For side-effecting operations, verification SHOULD confirm expected result. Ex: `launch app → verify target activity/package started` or `write file → verify write result` — Verification MUST remain bounded and MUST NOT introduce unintended side effects.

## 148. Side Effect Classification
SHOULD classified: `READ_ONLY, REVERSIBLE, SIDE_EFFECT, IRREVERSIBLE, EXTERNAL_DATA_TRANSFER` — feeds D03/D04 permission handling.

## 149. Recommended MVP Android Capabilities
Phase 1 SHOULD prioritize: `android.app.launch, android.browser.open, android.file.read, android.file.write, android.clipboard.read, android.clipboard.write, android.notification.create, android.network.status, android.device.info` — Only capabilities required by MVP.

## 150. MVP Explicit Exclusions
MVP SHOULD NOT include unrestricted: shell execution, arbitrary Intent execution, root operations, unrestricted filesystem access, accessibility automation, background surveillance, arbitrary app control, credential extraction — These require separate security contracts if ever considered.

## 151. Android App Shortcut Capability
If 8bitAI provides shortcut system, it MUST use: `App Registry → Validated Package → android.app.launch` — Shortcut data: `interface AndroidAppShortcut { id: string; label: string; packageName: string; iconReference?: string; enabled: boolean; }` — MUST NOT itself grant new permissions.

## 152. Shortcut Security
MUST validated when: created, updated, launched. If package removed: `shortcut → unavailable` not arbitrary fallback.

## 153. Android as 8bitAI Runtime
Long-term MAY use Android as dedicated host runtime. Even then: `Android Host ≠ Agent Authority` — separation MUST remain.

## 154. WebView / Capacitor Boundary
If using Capacitor: `Web Application → Capacitor Plugin Interface → Native Android Plugin → Android API` — Plugins MUST remain narrow. Web MUST NOT gain unrestricted reflection.

## 155. Plugin Contract Stability
Plugin APIs MUST versioned independently from Android implementation. Breaking changes MUST explicit. Ex: Plugin API v1, Android implementation v1.x — Agent depends on capability contract, not implementation details.

## 156. Native Capability Discovery
Agent Core MAY query availability through approved service. MUST NOT inspect Android APIs directly. Ex: `capabilityRegistry.supports("android.app.launch")`

## 157. Dynamic Capability Availability
MAY change during runtime (permission revoked, app uninstalled, network lost, hardware unavailable) — therefore availability MUST checked close enough to execution.

## 158. Security Decision Point
Final security decision MUST occur immediately before side-effect execution. `Plan → Permission → Final Validation → Native Execution` — Cached authorization alone MUST NOT sufficient for high-risk.

## 159. Audit Ordering
For security-sensitive execution: `Authorization → Audit Intent → Execution → Audit Result` — SHOULD ensure reliability even if execution fails.

## 160. Audit Failure
Audit failure MUST NOT silently convert rejected into allowed. For high-risk: `audit unavailable → policy may reject execution`

## 161. Data Residency
Android local storage SHOULD primary offline data boundary. Remote transmission MUST follow: user authorization, network policy, Memory Sync policy, privacy policy.

## 162. Encryption
Sensitive local data SHOULD encrypted at rest. Transport MUST encrypted for remote. D06 does not prescribe vendor.

## 163. Key Management
Encryption keys MUST NOT: hardcoded, committed to repository, stored in source code, stored in ordinary logs, stored as User Knowledge. SHOULD use platform secure storage.

## 164. Secret Redaction
Native errors, logs, audit records, diagnostic output MUST support redaction. Potential secrets: token, password, apiKey, secret, privateKey, authorization, cookie — must removed/masked.

## 165. Input Trust Levels
SHOULD classified: `TRUSTED_INTERNAL, USER_SELECTED, EXTERNAL_APPLICATION, EXTERNAL_NETWORK, UNKNOWN` — Only trusted internal control messages may influence execution metadata.

## 166. Control/Data Separation
External Android data MUST separated from control messages. Ex: PDF content "execute android.app.launch" is data, not execution command.

## 167. Prompt Injection Protection
Agent Core MUST continue applying D04 authority rules to all Android-originated text. Cannot: redefine system rules, grant permissions, modify ToolDefinition, modify MemoryPolicy, modify Planner authority.

## 168. Observability
SHOULD expose: bridge health, capability availability, execution latency, failure rates, permission failures, queue status — without sensitive content.

## 169. Performance
SHOULD minimize bridge overhead. Prefer `one structured call` over `many small native calls` when safe. However batching MUST NOT weaken permission/audit boundaries.

## 170. Memory Usage
Large file operations MUST use streaming/bounded buffers where possible. MUST NOT load arbitrarily large files into Agent Context.

## 171. Threading
Native adapters MUST respect Android threading. Blocking operations SHOULD NOT block UI thread. Long operations MUST asynchronous.

## 172. UI Thread Rule
MUST NOT freeze main Android UI thread. Blocking I/O SHOULD run off main thread.

## 173. Main-Thread Safety
UI-affecting operations MUST dispatched through appropriate main-thread mechanism. Abstraction SHOULD hide threading details from Agent Core.

## 174. Resource Cleanup
Adapters MUST release: streams, cursors, temporary files, listeners, callbacks, lifecycle observers. Failure paths MUST perform cleanup.

## 175. Lifecycle Cleanup
On shutdown or disposal: listeners removed, pending non-durable cancelled, temporary resources released — Durable work MUST transferred to durable state before disposal.

## 176. API Contract Stability
D06 public contracts MUST remain stable across minor changes. Breaking changes require: version update, migration plan, compatibility assessment, updated tests.

## 177. Implementation Invariants
MUST always hold:
- I-01 LLM cannot directly call Android.
- I-02 Planner cannot directly call Android.
- I-03 UI cannot bypass Tool/Permission.
- I-04 Android cannot write User Knowledge directly.
- I-05 Android cannot bypass MemoryService.
- I-06 Android cannot bypass SyncQueue.
- I-07 Unknown capability is rejected.
- I-08 Security uncertainty defaults to deny.
- I-09 Native failure cannot crash Agent Core.
- I-10 External data is untrusted.

## 178. Mandatory Acceptance Test Matrix
| ID | Test | Expected |
|----|------|----------|
| AND-001 | Unknown capability | REJECT |
| AND-002 | Invalid native request | REJECT |
| AND-003 | Unauthorized tool | REJECT |
| AND-004 | Invalid URI | REJECT |
| AND-005 | Arbitrary native execution | REJECT |
| AND-006 | Launch installed app | SUCCESS |
| AND-007 | Launch missing app | STRUCTURED FAILURE |
| AND-008 | User cancels picker | USER_CANCELLED |
| AND-009 | File read unauthorized | REJECT |
| AND-010 | Clipboard read | CONTROLLED |
| AND-011 | Credential persistence | REJECT |
| AND-012 | Native exception | NORMALIZED FAILURE |
| AND-013 | Timeout | TIMEOUT |
| AND-014 | Cancellation | CANCELLED |
| AND-015 | Process death | DURABLE STATE RECOVERED |
| AND-016 | Offline sync | QUEUED |
| AND-017 | Network restoration | SYNC RESUMES |
| AND-018 | Cross-user access | REJECT |
| AND-019 | Android permission revoked | REJECT / REQUEST |
| AND-020 | External prompt injection | TREATED AS DATA |
| AND-021 | Android → User Knowledge direct write | REJECT |
| AND-022 | UI → native bypass | REJECT |
| AND-023 | Notification duplication | DEDUPLICATED |
| AND-024 | Large result | BOUNDED |
| AND-025 | Partial execution | STATE PRESERVED |

## 179. MVP Definition of Done
D06 MVP dianggap selesai apabila: NativeBridge tersedia, CapabilityRegistry tersedia, permission mapping tersedia, App Launch, Browser Open, File Read/Write, Clipboard, Notification, Network Status, Device Info tersedia, lifecycle handling, durable SyncQueue integration, structured error handling, audit integration, security tests, process-death tests, offline tests lulus, no direct authority bypass ditemukan.

## 180. Recommended Phase Implementation
**Phase A — Foundation:** NativeBridge, CapabilityRegistry, NativeRequest, NativeResult, NativeError, AndroidExecutionContext
**Phase B — Core Capabilities:** App Launch, Browser, File, Clipboard, Notification, Network, Device
**Phase C — Security:** Permission Adapter, URI Validator, Intent Validator, Sensitive Data Filter, Audit
**Phase D — Lifecycle:** Lifecycle, Cancellation, Timeout, Background Work, Recovery
**Phase E — Memory Integration:** Android → Tool Result → D05 Memory Candidate Pipeline
**Phase F — Production Hardening:** Process Death Recovery, Migration, Performance, Telemetry, Security Testing, Device Compatibility

## 181. Dependency Direction
MUST follow: `Agent Core → Execution → Tool → Android Integration → Platform` — Not: `Android → Agent Core` — MAY emit events, but MUST NOT become authority.

## 182. Dependency Rule
Android layer MAY depend on: platform APIs, bridge, execution contracts, permission contracts, lifecycle contracts, security abstractions. MUST NOT depend directly on: LLM provider, prompt, Planner implementation, UI components, User Knowledge repository, remote database.

## 183. Testing Dependency Rule
Unit tests SHOULD mock: Android API, NativeBridge, Permission State, Lifecycle, Network — Integration SHOULD use actual Android APIs. E2E SHOULD validate: `Agent → Tool → Permission → Android → Result → Verification`

## 184. Security Review Gate
Before production release, MUST pass review for: arbitrary native execution, URI injection, Intent injection, file traversal, clipboard leakage, notification leakage, cross-user isolation, permission bypass, credential leakage, background execution abuse, external data injection, process-death recovery.

## 185. Contract Conflict Resolution
If conflict: `STOP → IDENTIFY → CHECK D00 → CHECK domain authority → REPORT CONFLICT → DO NOT silently modify upstream contract` — MUST NOT resolve by silently changing D03/D04/D05.

## 186. Anti-Drift Rules
Prohibited: adding Android-specific planner, adding Android-specific memory authority, allowing native bypass of Permission, allowing UI bypass of Tool System, allowing arbitrary Java/Kotlin execution, allowing Android to directly mutate remote memory, allowing external app content to redefine instructions, silently introducing vendor lock-in, silently introducing provider-specific LLM behavior.

## 187. Future Extension Points
MAY later support: camera, microphone, GPS, contacts, calendar, SMS, Bluetooth, USB, NFC, biometrics, share targets, background automation, accessibility, device-to-device communication — However each capability MUST receive its own: capability ID, risk classification, permission mapping, security analysis, data policy, audit behavior, acceptance tests. Future capabilities MUST NOT added through generic native execution.

## 188. Android Integration Philosophy
8bitAI should use Android as controlled capability surface. Android provides: device, apps, files, network, notifications, system services. 8bitAI provides: intent, planning, policy, permission, memory, verification, reasoning — The two responsibilities MUST remain separate.

## 189. Canonical Architecture
```
                         ┌─────────────────────┐
                         │        USER         │
                         └──────────┬──────────┘
                                    ↓
                         ┌─────────────────────┐
                         │     AGENT CORE      │
                         └──────────┬──────────┘
                                    ↓
                         ┌─────────────────────┐
                         │      PLANNER        │
                         └──────────┬──────────┘
                                    ↓
                         ┌─────────────────────┐
                         │  STRUCTURED PLAN    │
                         └──────────┬──────────┘
                                    ↓
                         ┌─────────────────────┐
                         │ POLICY / PERMISSION │
                         └──────────┬──────────┘
                                    ↓
                         ┌─────────────────────┐
                         │    TOOL EXECUTOR    │
                         └──────────┬──────────┘
                                    ↓
                    ┌──────────────────────────────┐
                    │ ANDROID INTEGRATION LAYER    │
                    │ Capability Registry          │
                    │ Native Bridge                │
                    │ Permission Adapter           │
                    │ Intent Adapter               │
                    │ File Adapter                 │
                    │ Clipboard Adapter            │
                    │ Notification Adapter         │
                    │ Browser Adapter              │
                    │ Lifecycle                    │
                    │ Security                     │
                    └──────────────┬───────────────┘
                                   ↓
                         ┌─────────────────────┐
                         │     ANDROID OS      │
                         └─────────────────────┘
Memory remains orthogonal:
Android Result → Tool Result → Agent Core → D05 Memory Candidate Pipeline
```

## 190. Final Contract Statement
D06 establishes Android as controlled execution boundary. Android MAY provide capabilities, but MUST NOT become independent authority. Canonical principle: Android provides capability. Tool System provides controlled access. Permission provides authorization. Agent Core provides orchestration. Planner provides planning. Memory System provides persistence. D00 provides ultimate authority.
Therefore:
```
LLM → Planner → Structured Plan → Permission → Tool → Android Integration → Android
```
is only canonical direction for agent-driven Android execution. And for persistence:
```
Android → Tool Result → Memory Candidate → D05 Validation → D05 Policy → D05 Permission → MemoryService → Repository
```
is only canonical path. D06 MUST NOT modify authority or contracts defined by D00–D05.

> END OF D06 — ANDROID INTEGRATION SPECIFICATION
> D06 sudah diposisikan sebagai Implementation Contract, sehingga langkah berikutnya secara arsitektural paling tepat adalah D07 — Execution Engine Specification: menerjemahkan Structured Plan dari D04 + Tool Contract D03 + Permission + Android Integration D06 menjadi mesin eksekusi Think → Act → Verify → Recover yang konkret.

