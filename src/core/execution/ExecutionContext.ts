/**
 * D07 §13-14 — ExecutionContext factory & isolation
 * Immutable, no secrets, versioned
 */

import type { ExecutionContext } from "./types/ExecutionTypes";

export const CONTEXT_VERSION = "1.0";

export function createExecutionContext(params: {
  executionId: string;
  planId: string;
  planVersion: string;
  sessionId: string;
  userId: string;
  autonomyLevel: ExecutionContext["permission"]["autonomyLevel"];
  networkAvailable: boolean;
  correlationId?: string;
  parentExecutionId?: string;
}): ExecutionContext {
  const now = new Date().toISOString();
  return {
    executionId: params.executionId,
    planId: params.planId,
    planVersion: params.planVersion,
    sessionId: params.sessionId,
    actor: {
      userId: params.userId,
      sessionId: params.sessionId,
      actorType: "agent",
    },
    permission: {
      autonomyLevel: params.autonomyLevel,
      grantedPermissions: [],
    },
    environment: {
      networkAvailable: params.networkAvailable,
    },
    variables: {},
    metadata: {
      createdAt: now,
      correlationId: params.correlationId ?? `corr_${params.executionId}`,
      parentExecutionId: params.parentExecutionId,
    },
    contextVersion: CONTEXT_VERSION,
  };
}

/**
 * D07 §14 — Context isolation: never expose mutable state cross-execution
 * Shared data must go via MemoryService/ToolSystem/Repository — not via context object
 */
export function cloneContext(ctx: ExecutionContext): ExecutionContext {
  return JSON.parse(JSON.stringify(ctx));
}

export function validateContext(ctx: ExecutionContext): { valid: boolean; reason?: string } {
  if (!ctx.executionId || !ctx.planId) return { valid: false, reason: "Missing executionId/planId" };
  // D07 §13 — must not contain secrets
  const serialized = JSON.stringify(ctx);
  const secretPatterns = ["password", "apiKey", "privateKey", "token", "secret"];
  for (const p of secretPatterns) {
    if (serialized.toLowerCase().includes(p.toLowerCase())) {
      // Heuristic — real check via SecretRedactor in production
      // For now, ensure no obvious credential keys in variables
      if (ctx.variables[p] !== undefined) return { valid: false, reason: `Context contains forbidden key: ${p}` };
    }
  }
  return { valid: true };
}
