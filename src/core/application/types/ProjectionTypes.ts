/**
 * D09 §74-76, §150, §236-239 — Presentation / Application Projection
 * No Raw Leakage: Authority Model → Application Model → Presentation Model
 * Deterministic: same authoritative state → same projection
 */

// ── Execution Projection (from D07 Execution) D09 §161 ──
export interface ExecutionViewState {
  executionId: string;
  title: string; // derived from plan.goal
  status: "QUEUED" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED" | "DENIED";
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  // Presentation-derived (D09 §12, §181)
  isLoading: boolean;
  isSubmitting: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  canRetry: boolean;
  error?: { messageKey: string; category: string } | null;
}

// ── Sync Projection (from D07B) D09 §159 ──
export interface SyncViewState {
  status: "SYNCED" | "SYNCING" | "OFFLINE" | "ATTENTION";
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncAt?: string;
  lastErrorCategory?: string | null;
  canRetry: boolean;
}

// ── Scheduler Projection (from D07A) D09 §160 ──
export interface SchedulerViewState {
  queued: number;
  scheduled: number;
  running: number;
  retryDelay: number;
  paused: number;
  nextRunAt?: string;
}

// ── Memory Projection (from D05) ──
export interface MemoryViewState {
  id: string;
  type: "short_term" | "conversation" | "task" | "long_term" | "user_knowledge";
  content: string; // already sanitized, minimal
  createdAt: string;
  canDelete: boolean;
}

// ── Dashboard Aggregation D09 §135-136 ──
export interface DashboardViewState {
  execution: { active: number; failed: number };
  sync: SyncViewState;
  scheduler: SchedulerViewState;
  recentActivity: Array<{ id: string; type: string; title: string; timestamp: string }>;
  isLoading: boolean;
}

// ── Shared App-level Projections used across layers (Facade/Services/Adapters) ──
export interface SyncStatus {
  status: "SYNCED" | "SYNCING" | "OFFLINE" | "ATTENTION";
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncAt?: string;
}

export interface AndroidAppInfo {
  packageName: string;
  label: string;
  launchable: boolean;
}

// Mapper contract D09 §74 — explicit mapping, no raw leakage
export interface ProjectionMapper<TAuthority, TPresentation> {
  map(authorityModel: TAuthority): TPresentation;
}
