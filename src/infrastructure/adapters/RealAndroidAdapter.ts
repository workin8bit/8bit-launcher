/**
 * D11 — RealAndroidAdapter (stub — delegates to D06 NativeBridge)
 * ViewModel never calls Android directly — only via Facade → Service → RealAdapter → NativeBridge
 */

import type { AndroidAdapter } from "../../core/application/adapters/AndroidAdapter";
import type { AndroidAppInfo } from "../../core/application/types/ProjectionTypes";
import type { Result } from "../../core/application/types/ApplicationTypes";

type NativeBridgeLike = {
  getInstalledApps(userId: string): Promise<AndroidAppInfo[]>;
  openApp(packageName: string, userId: string): Promise<void>;
  getPermissionState(permission: string, userId: string): Promise<{ state: "GRANTED" | "DENIED" | "UNKNOWN" | "RESTRICTED" }>;
  observeLifecycle(cb: (state: string) => void): () => void;
};

export class RealAndroidAdapter implements AndroidAdapter {
  constructor(private nativeBridge: NativeBridgeLike) {}

  async getInstalledApps(userId: string): Promise<Result<AndroidAppInfo[]>> {
    try {
      const data = await this.nativeBridge.getInstalledApps(userId);
      // Projection already — no raw Intent leakage
      return { success: true, data };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: { code: "ANDROID_ERROR", messageKey: "android.listFailed", message, retryable: false } };
    }
  }

  async openApp(packageName: string, userId: string): Promise<Result<void>> {
    if (!packageName.trim()) {
      return { success: false, error: { code: "VALIDATION_ERROR", messageKey: "android.packageRequired", retryable: false } };
    }
    try {
      await this.nativeBridge.openApp(packageName, userId);
      return { success: true, data: undefined };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const lower = message.toLowerCase();
      const key = lower.includes("not found") ? "android.appNotFound" : lower.includes("permission") ? "android.permissionDenied" : "android.openFailed";
      return { success: false, error: { code: "ANDROID_ERROR", messageKey: key, message, retryable: false } };
    }
  }

  async getPermissionState(permission: string, userId: string): Promise<Result<{ state: "GRANTED" | "DENIED" | "UNKNOWN" | "RESTRICTED" }>> {
    try {
      const data = await this.nativeBridge.getPermissionState(permission, userId);
      return { success: true, data };
    } catch {
      return { success: false, error: { code: "ANDROID_ERROR", messageKey: "android.permissionFailed", retryable: false } };
    }
  }

  observeLifecycle(callback: (state: string) => void): () => void {
    return this.nativeBridge.observeLifecycle(callback);
  }
}
