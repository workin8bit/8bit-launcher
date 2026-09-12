/**
 * D07 §22-24 — Verification
 * MUST distinguish Action accepted vs Action verified
 */

import type { ExecutionContext } from "../types/ExecutionTypes";
import type { PlanStep } from "../types/ExecutionStep";
import type { ToolResult, VerificationResult } from "../types/ExecutionResult";

export interface IVerificationManager {
  /**
   * Verify step result against expectedOutcome
   * Uses evidence, not assumption (D07 §22)
   * If Plan requires verification, MUST run it (D07 §24)
   */
  verify(context: ExecutionContext, step: PlanStep, result: ToolResult): Promise<VerificationResult>;

  /**
   * Verify overall plan success criteria
   */
  verifyPlan(context: ExecutionContext, plan: import("../types/ExecutionTypes").StructuredPlan, results: ToolResult[]): Promise<VerificationResult>;
}

export interface IVerificationRegistry {
  register(type: import("../types/ExecutionStep").VerificationType, verifier: IVerificationManager): void;
  get(type: string): IVerificationManager | undefined;
}
