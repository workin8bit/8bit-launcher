/**
 * D07 §75 — StepExecutor
 * D07 §151 — Must NOT be bypassed
 */

import type { ExecutionContext } from "../types/ExecutionTypes";
import type { PlanStep, StepExecutionResult } from "../types/ExecutionStep";

export interface IStepExecutor {
  /**
   * Execute single step:
   * validate → permission → tool execute → normalize → persist → return
   * MUST NOT call Android directly — via ToolExecutor → D06 NativeBridge
   */
  execute(step: PlanStep, context: ExecutionContext): Promise<StepExecutionResult>;
}

export interface IToolExecutor {
  /**
   * Execute via D03 ToolRegistry — only authorized path
   * D07 §25-26
   */
  execute(
    toolId: string,
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<import("../types/ExecutionResult").ToolResult>;
}
