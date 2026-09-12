/**
 * D11 — AndroidAdapter Contract Test
 */
import { FakeAndroidAdapter } from "../../src/core/application/adapters/AndroidAdapter";
import { RealAndroidAdapter } from "../../src/infrastructure/adapters/RealAndroidAdapter";
import { assertResult, runSuite } from "./helpers";

async function runAndroidContract(adapter: { getInstalledApps:(uid:string)=>Promise<unknown>; openApp:(pkg:string,uid:string)=>Promise<unknown>; getPermissionState:(perm:string,uid:string)=>Promise<unknown> }, label: string) {
  console.log(`\nAndroidAdapter — ${label}`);
  await runSuite("getInstalledApps returns Result<AndroidAppInfo[]>", async () => {
    const r = await adapter.getInstalledApps("u1");
    assertResult(r, "getInstalledApps");
    if ((r as { success: boolean }).success) {
      const arr = (r as { success: true; data: unknown[] }).data;
      if (!Array.isArray(arr)) throw new Error("data should be array");
    }
  });
  await runSuite("openApp validates packageName", async () => {
    const bad = await adapter.openApp("  ", "u1");
    assertResult(bad, "openApp empty");
    if ((bad as { success: boolean }).success) throw new Error("empty package should be VALIDATION_ERROR");
    const good = await adapter.openApp("com.android.chrome", "u1");
    assertResult(good, "openApp valid");
  });
  await runSuite("getPermissionState returns Result", async () => {
    const r = await adapter.getPermissionState("camera", "u1");
    assertResult(r, "getPermissionState");
  });
}

export async function run(): Promise<void> {
  await runAndroidContract(new FakeAndroidAdapter(), "FakeAndroidAdapter");
  const stubBridge = {
    async getInstalledApps() { return [{ packageName: "com.example", label: "Example", launchable: true }]; },
    async openApp(pkg: string) { if (!pkg.trim()) throw new Error("validation"); },
    async getPermissionState() { return { state: "GRANTED" as const }; },
    observeLifecycle() { return () => {}; },
  };
  await runAndroidContract(new RealAndroidAdapter(stubBridge as never), "RealAndroidAdapter (stub bridge)");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(()=>console.log("\n✅ Android contract PASS")).catch(e=>{console.error(e);process.exit(1);});
}
