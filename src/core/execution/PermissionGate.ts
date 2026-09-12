/**
 * D07 §28-32, §76 — PermissionGate (fail-closed)
 * D03/D06 permission authority — Engine only enforces
 */

import type { IPermissionGate, PermissionRequest, PermissionDecision } from "./interfaces/IPermissionGate";
import type { ExecutionContext } from "./types/ExecutionTypes";

export class PermissionGate implements IPermissionGate {
  constructor(
    private policy?: {
      isToolAllowed?: (toolId: string, ctx: ExecutionContext) => Promise<boolean>;
    }
  ) {}

  /**
   * D07 §30 Fail-Closed: UNKNOWN/ERROR/TIMEOUT → ALLOW=FALSE
   * D07 §29 Re-check before every sensitive action
   */
  async evaluate(request: PermissionRequest, context: ExecutionContext): Promise<PermissionDecision> {
    // 1. Validate permissionLevel exists (0-4)
    if (request.permissionLevel < 0 || request.permissionLevel > 4) {
      return {
        allowed: false,
        requiresUserConfirmation: false,
        reason: `Invalid permissionLevel ${request.permissionLevel}`,
      };
    }

    // 2. Check tool policy (if provided)
    if (this.policy?.isToolAllowed) {
      try {
        const allowedByPolicy = await this.policy.isToolAllowed(request.toolId, context);
        if (!allowedByPolicy) {
          return {
            allowed: false,
            requiresUserConfirmation: false,
            reason: `Tool ${request.toolId} denied by policy`,
          };
        }
      } catch (e) {
        // D07 §30 — UNKNOWN/ERROR → DENY (fail-closed)
        return {
          allowed: false,
          requiresUserConfirmation: false,
          reason: `Permission check failed for ${request.toolId} — denying (fail-closed)`,
        };
      }
    }

    // 3. Evaluate by permissionLevel + autonomyLevel (D02 §3.7, D07 §28)
    const { autonomyLevel } = context.permission;
    const level = request.permissionLevel;

    // L0-L1 (LOW) — always allowed with logging
    if (level <= 1) {
      return { allowed: true, requiresUserConfirmation: false, reason: `L${level} (LOW) auto-allowed` };
    }

    // L2 (MEDIUM) — auto but undoable, allowed in all autonomy except Manual? For MVP: allow
    if (level === 2) {
      return { allowed: true, requiresUserConfirmation: false, reason: "L2 (MEDIUM) auto-allowed, undoable" };
    }

    // L3-L4 (HIGH) — requires confirmation unless Autonomous
    if (level >= 3) {
      if (autonomyLevel === "Autonomous") {
        return { allowed: true, requiresUserConfirmation: false, reason: `L${level} (HIGH) auto in Autonomous` };
      }
      if (autonomyLevel === "Semi-Autonomous" && level === 3) {
        return { allowed: true, requiresUserConfirmation: false, reason: "L3 auto in Semi-Autonomous" };
      }
      // Manual / Assisted → requires confirmation
      return {
        allowed: false,
        requiresUserConfirmation: true,
        reason: `L${level} (HIGH) requires user confirmation in ${autonomyLevel}`,
      };
    }

    // Default deny (fail-closed)
    return { allowed: false, requiresUserConfirmation: false, reason: "Default deny (fail-closed)" };
  }
}
