/**
 * Execution Feature — UI Contract
 * D09 §150-151 — deterministic projection, presentation mapping
 */
import type { ExecutionViewModel } from "../viewmodels/ExecutionViewModel";
import type { ExecutionViewState } from "../../../core/application/types/ProjectionTypes";

export interface ExecutionScreenProps {
  viewModel: ExecutionViewModel;
  executionId: string;
}

export interface ExecutionScreenState {
  execution: ExecutionViewState | undefined;
  isLoading: boolean;
}

export function mapExecutionToScreenState(
  execution: ExecutionViewState | undefined,
  isLoading: boolean
): ExecutionScreenState {
  return { execution, isLoading };
}

export type ExecutionScreenRenderer = (props: ExecutionScreenProps & ExecutionScreenState) => unknown;
