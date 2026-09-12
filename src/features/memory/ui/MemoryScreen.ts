/**
 * Memory Feature — UI Contract
 */
import type { MemoryViewModel } from "../viewmodels/MemoryViewModel";
import type { MemoryListViewState } from "../stores/MemoryStore";

export interface MemoryScreenProps {
  viewModel: MemoryViewModel;
}

export interface MemorySearchFormState {
  query: string;
  isSearching: boolean;
  canSearch: boolean;
}

export function deriveSearchFormState(query: string, isSearching: boolean): MemorySearchFormState {
  return {
    query,
    isSearching,
    canSearch: query.trim().length > 0 && !isSearching,
  };
}

export type MemoryScreenRenderer = (props: MemoryScreenProps & { viewState: MemoryListViewState }) => unknown;
