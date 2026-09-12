/**
 * Dashboard Feature — Public Barrel
 * D09 §71-72 — Feature public boundary: only ViewModel, Store, UI contract
 * Feature does NOT export Service/Adapter/Repository
 */
export { DashboardStore } from "./stores/DashboardStore";
export { DashboardViewModel } from "./viewmodels/DashboardViewModel";
export type { DashboardScreenProps, DashboardScreenState, DashboardScreenRenderer } from "./ui/DashboardScreen";
export { mapToScreenState } from "./ui/DashboardScreen";
