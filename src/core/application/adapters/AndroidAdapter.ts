/**
 * D09 §26 — D06 Android Adapter
 * UI never calls Android API directly
 */

import type { Result } from "../types/ApplicationTypes";
import type { AndroidAppInfo } from "../types/ProjectionTypes";

export type { AndroidAppInfo } from "../types/ProjectionTypes";

export interface AndroidAdapter {
  getInstalledApps(userId: string): Promise<Result<AndroidAppInfo[]>>;
  openApp(packageName: string, userId: string): Promise<Result<void>>;
  getPermissionState(permission: string, userId: string): Promise<Result<{ state: "GRANTED"|"DENIED"|"UNKNOWN"|"RESTRICTED" }>>;
  observeLifecycle(callback: (state: string) => void): () => void;
}

export class FakeAndroidAdapter implements AndroidAdapter {
  async getInstalledApps(): Promise<Result<AndroidAppInfo[]>> {
    return { success: true, data: [{ packageName: "com.android.chrome", label: "Chrome", launchable: true }] };
  }
  async openApp(packageName: string, _userId?: string): Promise<Result<void>> {
    if (!packageName.trim()) {
      return { success: false, error: { code: "VALIDATION_ERROR", messageKey: "android.packageRequired", retryable: false } };
    }
    return { success: true, data: undefined };
  }
  async getPermissionState(): Promise<Result<{ state: "GRANTED"|"DENIED"|"UNKNOWN"|"RESTRICTED" }>> {
    return { success: true, data: { state: "GRANTED" } };
  }
  observeLifecycle(): () => void { return () => {}; }
}
