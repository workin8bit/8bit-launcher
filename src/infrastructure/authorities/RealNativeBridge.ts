/**
 * D11 — RealNativeBridge (D06 authority)
 * Capacitor plugin bridge — in web mode, degrades gracefully
 * Never exposes raw Android API — only scoped capabilities (D06 §6)
 * Capacitor is optional — loaded only if installed at runtime
 */

export interface AndroidAppInfo {
  packageName: string;
  label: string;
  launchable: boolean;
}

// Capacitor is optional — only loaded if installed
// Using indirect eval to avoid TypeScript module resolution errors
async function getCapacitorPlugin(name: string): Promise<unknown> {
  try {
    // Dynamic require via Function — avoids TS module resolution for optional dep
    // eslint-disable-next-line no-new-func
    const loadModule = new Function("return import(' Capacitor/core ')");
    const mod = await loadModule() as { Capacitor?: { getPlugin?: (n: string) => unknown } };
    return mod?.Capacitor?.getPlugin?.(name) ?? null;
  } catch { return null; }
}

export class RealNativeBridge {
  private _appsCache: AndroidAppInfo[] | null = null;

  async getInstalledApps(_userId: string): Promise<AndroidAppInfo[]> {
    if (this._appsCache) return this._appsCache;
    const plugin = await getCapacitorPlugin("AppLauncher");
    if (plugin && typeof (plugin as { getInstalledApps?: unknown }).getInstalledApps === "function") {
      this._appsCache = await (plugin as { getInstalledApps: () => Promise<AndroidAppInfo[]> }).getInstalledApps();
      return this._appsCache;
    }
    this._appsCache = [];
    return this._appsCache;
  }

  async openApp(packageName: string, _userId: string): Promise<void> {
    if (!packageName.trim()) throw new Error("packageRequired");
    const plugin = await getCapacitorPlugin("AppLauncher");
    if (plugin && typeof (plugin as { openApp?: unknown }).openApp === "function") {
      await (plugin as { openApp: (p: string) => Promise<void> }).openApp(packageName);
      return;
    }
    // Browser fallback
    if (packageName.startsWith("http") && typeof window !== "undefined") {
      window.open(packageName, "_blank");
    }
  }

  async getPermissionState(
    _permission: string,
    _userId: string
  ): Promise<{ state: "GRANTED" | "DENIED" | "UNKNOWN" | "RESTRICTED" }> {
    return { state: "UNKNOWN" };
  }

  observeLifecycle(cb: (state: string) => void): () => void {
    if (typeof window === "undefined") return () => {};
    const handler = () => cb("resumed");
    window.addEventListener("focus", handler);
    window.addEventListener("blur", () => cb("paused"));
    return () => {
      window.removeEventListener("focus", handler);
      window.removeEventListener("blur", () => cb("paused"));
    };
  }
}