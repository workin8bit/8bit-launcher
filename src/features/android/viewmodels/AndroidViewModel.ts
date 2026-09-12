/**
 * Android Feature — ViewModel (Android app projection/launcher)
 * D09 §82, §87 — Canonical: User → UI → ViewModel → OpenAndroidApp Command → Facade → AndroidService → D06 → Android
 * ViewModel never calls Android API directly
 */
import type { ApplicationFacade } from "../../../core/application/facade/ApplicationFacade";
import type { AndroidStore } from "../stores/AndroidStore";
import type { UserContext } from "../../../core/application/types/ApplicationTypes";

export class AndroidViewModel {
  constructor(
    private facade: ApplicationFacade,
    private store: AndroidStore,
    private userContext: UserContext
  ) {}

  get viewState() {
    return this.store.get();
  }

  async loadApps(): Promise<void> {
    this.store.setLoading(true);
    const result = await this.facade.getInstalledApps(this.userContext);
    if (result.success) {
      this.store.set({ apps: result.data, isLoading: false, error: null });
    } else {
      this.store.set({ ...this.store.get(), isLoading: false, error: { messageKey: result.error.messageKey } });
    }
  }

  async onOpenApp(packageName: string): Promise<{ success: boolean; errorKey?: string }> {
    if (!packageName.trim()) return { success: false, errorKey: "android.packageRequired" };
    const result = await this.facade.openAndroidApp(packageName, this.userContext);
    if (result.success) return { success: true };
    return { success: false, errorKey: result.error.messageKey };
  }

  subscribe(listener: (s: ReturnType<AndroidStore["get"]>) => void): () => void {
    return this.store.subscribe(listener);
  }

  dispose(): void {}
}
