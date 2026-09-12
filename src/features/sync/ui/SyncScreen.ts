/**
 * Sync Feature — UI Contract
 * Sync indicators ●/◐/○/! are pure projection — ViewModel decides code, UI maps to glyph
 */
import type { SyncViewModel } from "../viewmodels/SyncViewModel";
import type { SyncViewState } from "../../../core/application/types/ProjectionTypes";

export interface SyncScreenProps {
  viewModel: SyncViewModel;
}

export type SyncIndicator = "●" | "◐" | "○" | "!" ; // SYNCED / SYNCING / OFFLINE / ATTENTION

export function indicatorForStatus(status: SyncViewState["status"]): SyncIndicator {
  switch (status) {
    case "SYNCED": return "●";
    case "SYNCING": return "◐";
    case "OFFLINE": return "○";
    case "ATTENTION": return "!";
  }
}

export type SyncScreenRenderer = (props: SyncScreenProps & { viewState: SyncViewState; indicator: SyncIndicator }) => unknown;
