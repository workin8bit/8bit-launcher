/**
 * D09 §13-14, §34 — ViewModel Types
 * ViewModel: Domain/Application State → Presentation State + UI Event → Command
 * No repository, no Android API, no SyncQueue access
 */

import type { ExecutionViewState, SyncViewState, DashboardViewState } from "./ProjectionTypes";

// Generic ViewModel contract
export interface ViewModel<TViewState> {
  readonly viewState: TViewState;
  dispose(): void;
}

// Execution ViewModel contract D09 §83
export interface ExecutionViewModelContract extends ViewModel<ExecutionViewState> {
  pause(): Promise<void>;
  cancel(): Promise<void>;
  retry(): Promise<void>;
  refresh(): Promise<void>;
}

// Sync ViewModel
export interface SyncViewModelContract extends ViewModel<SyncViewState> {
  retry(): Promise<void>;
  refresh(): Promise<void>;
}

// Dashboard ViewModel D09 §135
export interface DashboardViewModelContract extends ViewModel<DashboardViewState> {
  refresh(): Promise<void>;
}

// Form state D09 §190-191
export type FormState = "INITIAL" | "DIRTY" | "VALID" | "INVALID" | "SUBMITTING" | "SUBMITTED" | "ERROR";

export interface FormViewState<T> {
  values: T;
  state: FormState;
  errors: Record<string, string>;
  isSubmitting: boolean;
  canSubmit: boolean;
}
