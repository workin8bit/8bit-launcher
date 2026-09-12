/**
 * D11 — SyncAdapter Contract Test
 */
import { FakeSyncAdapter } from "../../src/core/application/adapters/SyncAdapter";
import { RealSyncAdapter } from "../../src/infrastructure/adapters/RealSyncAdapter";
import { assertResult, runSuite } from "./helpers";

async function runSyncContract(adapter: { getSyncStatus: (uid:string)=>Promise<unknown>; observeSync:(uid:string,cb:(s:unknown)=>void)=>()=>void; requestSync:(uid:string)=>Promise<unknown>; getPending:(uid:string)=>Promise<unknown>; getConflicts:(uid:string)=>Promise<unknown> }, label: string) {
  console.log(`\nSyncAdapter — ${label}`);
  await runSuite("getSyncStatus returns Result<SyncStatus> with OFFLINE valid", async () => {
    const r = await adapter.getSyncStatus("u1");
    assertResult(r, "getSyncStatus");
    if ((r as { success: boolean }).success) {
      const data = (r as { success: true; data: { status: string } }).data;
      const valid = ["SYNCED","SYNCING","OFFLINE","ATTENTION"].includes(data.status);
      if (!valid) throw new Error(`status ${data.status} should be SYNCED/SYNCING/OFFLINE/ATTENTION`);
    }
  });
  await runSuite("observeSync returns unsubscribe", async () => {
    const unsub = adapter.observeSync("u1", () => {});
    if (typeof unsub !== "function") throw new Error("observeSync should return () => void");
    unsub();
  });
  await runSuite("requestSync returns Result<void>", async () => {
    const r = await adapter.requestSync("u1");
    assertResult(r, "requestSync");
  });
  await runSuite("getPending returns Result<unknown[]>", async () => {
    const r = await adapter.getPending("u1");
    assertResult(r, "getPending");
  });
  await runSuite("getConflicts returns Result<unknown[]>", async () => {
    const r = await adapter.getConflicts("u1");
    assertResult(r, "getConflicts");
  });
}

export async function run(): Promise<void> {
  await runSyncContract(new FakeSyncAdapter(), "FakeSyncAdapter");
  const stubQueue = {
    async getStatus() { return { status: "SYNCED" as const, pendingCount: 0, syncingCount: 0, failedCount: 0, conflictCount: 0, lastSyncAt: new Date().toISOString() }; },
    observeStatus(_uid: string, _cb: (s: unknown)=>void) { return () => {}; },
    async flush() {},
    async getPending() { return []; },
    async getConflicts() { return []; },
  };
  await runSyncContract(new RealSyncAdapter(stubQueue as never), "RealSyncAdapter (stub queue)");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(()=>console.log("\n✅ Sync contract PASS")).catch(e=>{console.error(e);process.exit(1);});
}
