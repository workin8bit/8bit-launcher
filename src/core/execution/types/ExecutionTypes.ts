/**
 * D07 §7-8, §15 — Core Execution Types
 * Depends on D03 (Tool), D04 (Plan), D05 (Memory), D06 (Android)
 */

import type { ExecutionState } from "./ExecutionState";
import type { PlanStep } from "./ExecutionStep";
import type { ExecutionError, VerificationSummary } from "./ExecutionResult";

// D03 — Permission Level (authoritative)
export type PermissionLevel = 0 | 1 | 2 | 3 | 4;
export type RiskLabel = "LOW" | "MEDIUM" | "HIGH";

// D07 §13 — ExecutionContext (immutable, no secrets)
export interface ExecutionContext {
  executionId: string; // exec_01J...
  planId: string;
  planVersion: string;
  sessionId: string;
  actor: ActorContext;
  permission: PermissionContext;
  environment: EnvironmentContext;
  variables: Record<string, unknown>;
  metadata: ExecutionMetadata;
  contextVersion: string; // for migration D07 §113
}

export interface ActorContext {
  userId: string;
  sessionId: string;
  actorType: "user" | "agent" | "system" | "background";
}

export interface PermissionContext {
  autonomyLevel: "Manual" | "Assisted" | "Semi-Autonomous" | "Autonomous";
  grantedPermissions: string[];
}

export interface EnvironmentContext {
  networkAvailable: boolean;
  networkType?: "wifi" | "cellular" | "ethernet" | "unknown";
  androidSdkVersion?: number;
  appVersion?: string;
}

export interface ExecutionMetadata {
  createdAt: string;
  startedAt?: string;
  correlationId: string;
  parentExecutionId?: string; // for replan lineage D07 §79
}

// D07 §15 — StructuredPlan (from D04)
export interface StructuredPlan {
  planId: string;
  version: string;
  goal: string;
  steps: PlanStep[];
  successCriteria?: VerificationSummary;
  failurePolicy?: FailurePolicy;
}

export interface FailurePolicy {
  onStepFailure: "FAIL" | "SKIP" | "RETRY" | "ASK_USER" | "ABORT";
  allowPartialSuccess?: boolean;
}

// D07 §7 — Execution aggregate
export interface Execution {
  executionId: string;
  planId: string;
  planVersion: string;
  plan: StructuredPlan;
  context: ExecutionContext;
  state: ExecutionState;
  currentStepId?: string;
  completedSteps: string[];
  pendingSteps: string[];
  failedStepId?: string;
  variables: Record<string, unknown>;
  attemptCounters: Record<string, number>; // stepId -> attempt
  retryState: Record<string, number>;
  waitingReason?: string;
  permissionState?: string;
  lastKnownOutcome?: string;
  actionStatus?: "IDLE" | "IN_FLIGHT" | "COMPLETED"; // D07 §132
  executionLease?: ExecutionLease;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  executionSchemaVersion: string;
}

export interface ExecutionLease {
  holderId: string;
  expiresAt: string;
}

export interface ExecutionStatus {
  executionId: string;
  state: ExecutionState;
  currentStepId?: string;
  completedStepCount: number;
  totalStepCount: number;
  retryCount: number;
  recoveryCount: number;
  startedAt?: string;
  updatedAt: string;
}

// D07 §148 — Side effect classification (from D03/D06)
export type SideEffectClass = "PURE" | "READ_ONLY" | "SIDE_EFFECTING" | "DESTRUCTIVE" | "EXTERNAL_DATA_TRANSFER";
