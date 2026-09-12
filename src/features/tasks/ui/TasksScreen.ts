/**
 * Tasks Feature — UI Contract
 * D09 §190-191 — form state handled in UI, ViewModel transforms
 */
import type { TasksViewModel } from "../viewmodels/TasksViewModel";
import type { TasksViewState } from "../stores/TasksStore";

export interface TasksScreenProps {
  viewModel: TasksViewModel;
}

export interface TasksFormState {
  goal: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  error: string | null;
}

export function deriveFormState(goal: string, isSubmitting: boolean): TasksFormState {
  return {
    goal,
    isSubmitting,
    canSubmit: goal.trim().length > 0 && !isSubmitting,
    error: null,
  };
}

export type TasksScreenRenderer = (props: TasksScreenProps & { viewState: TasksViewState }) => unknown;
