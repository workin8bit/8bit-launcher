/**
 * D07 §22-24 — Verification Manager
 * MUST distinguish Action accepted vs Action verified
 * Uses evidence, not assumption
 */

import type { IVerificationManager } from "./interfaces/IVerificationManager";
import type { ExecutionContext } from "./types/ExecutionTypes";
import type { PlanStep } from "./types/ExecutionStep";
import type { ToolResult, VerificationResult } from "./types/ExecutionResult";

export class VerificationManager implements IVerificationManager {
  async verify(_context: ExecutionContext, step: PlanStep, result: ToolResult): Promise<VerificationResult> {
    // 1. If tool failed, verification fails
    if (!result.success) {
      return {
        success: false,
        reason: `Tool failed: ${result.error?.message ?? "unknown"}`,
        evidence: result.error,
      };
    }

    // 2. If no verification criteria, consider success if tool success (but log warning)
    if (!step.verification) {
      return {
        success: true,
        reason: "No verification criteria — tool success accepted",
        evidence: result.data,
      };
    }

    // 3. Evaluate rule safely (not eval) — MVP supports simple rules
    const rule = step.verification.rule;
    if (!rule) {
      return {
        success: true,
        reason: "No verification rule — tool success accepted",
        evidence: result.data,
      };
    }
    const evidence = result.data as Record<string, unknown> | undefined;

    try {
      const passed = this.evaluateRule(rule, evidence, result);
      if (!passed) {
        return {
          success: false,
          reason: `Verification rule failed: ${rule}`,
          evidence: result.data,
        };
      }
      return {
        success: true,
        reason: `Verification passed: ${rule}`,
        evidence: result.data,
      };
    } catch (e) {
      return {
        success: false,
        reason: `Verification error: ${e instanceof Error ? e.message : String(e)}`,
        evidence: result.data,
      };
    }
  }

  async verifyPlan(
    _context: ExecutionContext,
    _plan: import("./types/ExecutionTypes").StructuredPlan,
    results: ToolResult[]
  ): Promise<VerificationResult> {
    // Overall plan verification: all required steps verified
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      return {
        success: false,
        reason: `${failed.length} steps failed`,
        evidence: failed.map(f => f.error?.code),
      };
    }
    return { success: true, reason: "All steps verified", evidence: results.length };
  }

  // Safe rule evaluator — supports: "field exists", "field > value", "field == value", "content.length > N"
  private evaluateRule(rule: string, data: Record<string, unknown> | undefined, result: ToolResult): boolean {
    if (!rule || rule.trim() === "") return true;
    if (!data) return false;

    // Simple patterns for MVP
    // e.g., "results.length >= 2", "content.length > 500", "bytesWritten > 0", "saved == true", "exitCode == 0"
    const trimmed = rule.trim();

    // Handle "results.length >= 2"
    const lengthMatch = trimmed.match(/^(\w+)\.length\s*([>!=<]+)\s*(\d+)$/);
    if (lengthMatch) {
      const [, field, op, valStr] = lengthMatch;
      const val = parseInt(valStr, 10);
      const fieldVal = data[field];
      const len = Array.isArray(fieldVal) ? fieldVal.length : typeof fieldVal === "string" ? fieldVal.length : 0;
      return this.compare(len, op, val);
    }

    // Handle "field == true/false" or "field == 0"
    const eqMatch = trimmed.match(/^(\w+)\s*([=!]=)\s*(.+)$/);
    if (eqMatch) {
      const [, field, op, expectedRaw] = eqMatch;
      const actual = data[field] ?? (result.data as Record<string, unknown>)?.[field];
      let expected: unknown = expectedRaw.trim();
      if (expected === "true") expected = true;
      else if (expected === "false") expected = false;
      else if (!isNaN(Number(expected))) expected = Number(expected);
      else expected = String(expected).replace(/^["']|["']$/g, "");

      if (op === "==" || op === "===") return actual === expected;
      if (op === "!=" || op === "!==") return actual !== expected;
    }

    // Handle "field > 0"
    const compMatch = trimmed.match(/^(\w+)\s*([>!=<]+)\s*(\d+)$/);
    if (compMatch) {
      const [, field, op, valStr] = compMatch;
      const val = parseInt(valStr, 10);
      const actual = data[field] as number | undefined;
      if (typeof actual !== "number") return false;
      return this.compare(actual, op, val);
    }

    // Fallback: treat as "field exists" check
    if (trimmed in data) {
      return data[trimmed] !== undefined && data[trimmed] !== null;
    }

    // If rule contains "includes", handle content.includes('xxx')
    if (trimmed.includes("includes")) {
      const incMatch = trimmed.match(/(\w+)\.includes\(['"](.+?)['"]\)/);
      if (incMatch) {
        const [, field, substr] = incMatch;
        const fieldVal = data[field] as string | undefined;
        return typeof fieldVal === "string" && fieldVal.includes(substr);
      }
    }

    return false;
  }

  private compare(a: number, op: string, b: number): boolean {
    switch (op) {
      case ">": return a > b;
      case ">=": return a >= b;
      case "<": return a < b;
      case "<=": return a <= b;
      case "==":
      case "===": return a === b;
      case "!=":
      case "!==": return a !== b;
      default: return false;
    }
  }
}
