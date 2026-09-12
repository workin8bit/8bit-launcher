/**
 * Android Feature — UI Contract
 */
import type { AndroidViewModel } from "../viewmodels/AndroidViewModel";
import type { AndroidViewState } from "../stores/AndroidStore";

export interface AndroidScreenProps {
  viewModel: AndroidViewModel;
}

export interface AndroidAppRowProps {
  packageName: string;
  label: string;
  launchable: boolean;
  onOpen: (packageName: string) => void;
}

export function mapToRows(viewState: AndroidViewState): AndroidAppRowProps[] {
  return viewState.apps.map(app => ({
    packageName: app.packageName,
    label: app.label,
    launchable: app.launchable,
    onOpen: () => {},
  }));
}

export type AndroidScreenRenderer = (props: AndroidScreenProps & { viewState: AndroidViewState }) => unknown;
