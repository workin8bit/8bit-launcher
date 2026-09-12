/**
 * D07 §74 — ExecutionEngine Interface
 * D07 §151 — Recommended Initial Interfaces
 * Contract first — no God Object (D07 §184)
 */

import type { ExecutionContext, StructuredPlan, Execution, ExecutionStatus } from "../types/ExecutionTypes";
import type { ExecutionResult } from "../types/ExecutionResult";

export interface IExecutionEngine {
  /**
   * Start new execution from StructuredPlan (D04)
   * MUST validate plan, create durable state, then schedule
   */
  start(plan: StructuredPlan, context: ExecutionContext): Promise<ExecutionResult>;

  /**
   * Resume after process death / waiting
   * MUST load durable state, revalidate, recheck permission, then resume
   */
  resume(executionId: string): Promise<ExecutionResult>;

  /**
   * Cooperative cancellation D07 §34
   */
  cancel(executionId: string): Promise<void>;

  /**
   * Read-only status for UI (D07 §103)
   */
  status(executionId: string): Promise<ExecutionStatus>;

  /**
   * For testing: get full execution (not exposed to UI)
   */
  getExecution(executionId: string): Promise<Execution | null>;
}
