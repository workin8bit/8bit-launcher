/**
 * D07 §28-30, §76 — PermissionGate
 * D03 — Tool permissionLevel authoritative
 * Fail-closed by default
 */

import type { ExecutionContext } from "../types/ExecutionTypes";
import type { PermissionLevel } from "../types/ExecutionTypes";

export interface PermissionRequest {
  toolId: string;
  capabilityId?: string;
  permissionLevel: PermissionLevel;
  input: Record<string, unknown>;
  stepId: string;
}

export interface PermissionDecision {
  allowed: boolean;
  requiresUserConfirmation: boolean;
  reason: string;
}

export interface IPermissionGate {
  /**
   * Evaluate before EVERY sensitive action (D07 §29 re-check)
   * If permission status UNKNOWN/ERROR/TIMEOUT → ALLOW=FALSE (fail-closed D07 §30)
   */
  evaluate(request: PermissionRequest, context: ExecutionContext): Promise<PermissionDecision>;
}

export interface IPolicyEvaluator {
  /**
   * Higher-level policy (risk, autonomy, resource budget)
   * D07 §102 Risk-Aware Execution
   */
  evaluateRisk(request: PermissionRequest, context: ExecutionContext): Promise<{ allowed: boolean; reason: string }>;
}
