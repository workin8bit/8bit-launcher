/**
 * Dashboard Feature — UI Contract (placeholder, no business logic)
 * D09 §12 — UI is dumb, ViewModel transforms, Facade is boundary
 * Allowed: ui → viewmodel, shared. No repository/infrastructure/authority.
 */
import type { DashboardViewModel } from "../viewmodels/DashboardViewModel";
import type { DashboardViewState } from "../../../core/application/types/ProjectionTypes";

export interface DashboardScreenProps {
  viewModel: DashboardViewModel;
}

export interface DashboardScreenState {
  viewState: DashboardViewState;
  isLoading: boolean;
}

// UI helper — pure mapping, no side effects
export function mapToScreenState(viewState: DashboardViewState): DashboardScreenState {
  return {
    viewState,
    isLoading: viewState.isLoading,
  };
}

// Placeholder render contract — actual React/Vue component will live here later
export type DashboardScreenRenderer = (props: DashboardScreenProps) => unknown;
