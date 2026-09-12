/**
 * D07 §102, §148 — Risk-Aware Execution, Side Effect Classification
 * Engine only enforces risk from D03/D06 — never downgrades
 */

import type { IPolicyEvaluator } from "./interfaces/IPermissionGate";
import type { PermissionRequest } from "./interfaces/IPermissionGate";
import type { ExecutionContext, SideEffectClass } from "./types/ExecutionTypes";

export class PolicyEvaluator implements IPolicyEvaluator {
  async evaluateRisk(request: PermissionRequest, _context: ExecutionContext): Promise<{ allowed: boolean; reason: string }> {
    // Risk classification comes from ToolDefinition (D03) / Capability (D06)
    // Engine MUST NOT downgrade risk (D07 §102)
    // For scaffolding, we just pass through — real policy would check:
    // - Tool riskLabel vs autonomy
    // - Destructive actions stricter
    // - External data transfer policy
    return { allowed: true, reason: `Risk-evaluated for ${request.toolId}` };
  }

  classifySideEffect(toolId: string): SideEffectClass {
    // MVP mapping — can be extended via registry
    const pure = new Set(["device.info", "memory.search"]);
    const readOnly = new Set(["web_search", "web_fetch", "file_read", "android.network.status"]);
    const destructive = new Set(["file_delete", "terminal_exec"]);

    if (pure.has(toolId)) return "PURE";
    if (readOnly.has(toolId)) return "READ_ONLY";
    if (destructive.has(toolId)) return "DESTRUCTIVE";
    if (toolId.includes("share") || toolId.includes("send") || toolId.includes("export")) return "EXTERNAL_DATA_TRANSFER";
    return "SIDE_EFFECTING";
  }
}
