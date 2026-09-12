/**
 * D09 §6-8, §82, §87 — AndroidService → D06
 * Canonical: User → UI → ViewModel → OpenAndroidApp Command → Facade → AndroidService → D06 → Android
 * No Button → Intent direct
 */

import type { ApplicationCommand, Result } from "../types/ApplicationTypes";
import type { AndroidAdapter } from "../adapters/AndroidAdapter";

export class AndroidService {
  constructor(private androidAdapter: AndroidAdapter) {}

  async openApp(command: ApplicationCommand<{ packageName: string }>): Promise<Result<void>> {
    return this.androidAdapter.openApp(command.payload.packageName, command.userContext.userId);
  }

  async getInstalledApps(userId: string): Promise<Result<import("../adapters/AndroidAdapter").AndroidAppInfo[]>> {
    return this.androidAdapter.getInstalledApps(userId);
  }
}
