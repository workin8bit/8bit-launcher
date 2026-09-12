/**
 * D11 — ExecutionAdapter Contract Test
 * Runs same suite against FakeExecutionAdapter and RealExecutionAdapter
 */

import { FakeExecutionAdapter } from "../../src/core/application/adapters/ExecutionAdapter";
import { RealExecutionAdapter } from "../../src/infrastructure/adapters/RealExecutionAdapter";
import { assertResult, runSuite } from "./helpers";

async function runExecutionContract(adapter: { execute: (a: unknown, b: unknown) => Promise<unknown>; getExecution: (a: string, b: string) => Promise<unknown>; pause: (a: string,b:string)=>Promise<unknown>; cancel: (a:string,b:string)=>Promise<unknown>; observeExecution: (a:string,b:string,c:(s:unknown)=>void)=>()=>void }, label: string) {
  console.log(`\nExecutionAdapter — ${label}`);
  await runSuite("execute returns Result<{executionId}>", async () => {
    const r = await adapter.execute({ goal: "test" }, { userId: "u1" });
    assertResult(r, "execute");
    if ((r as { success: boolean }).success) {
      const data = (r as { success: true; data: { executionId: string } }).data;
      if (typeof data.executionId !== "string" || data.executionId.length === 0) throw new Error("executionId should be non-empty string");
    }
  });
  await runSuite("getExecution returns Result (found or NOT_FOUND)", async () => {
    const r = await adapter.getExecution("nonexistent", "u1");
    assertResult(r, "getExecution");
  });
  await runSuite("pause returns Result<void>", async () => {
    const r = await adapter.pause("exec_1", "u1");
    assertResult(r, "pause");
  });
  await runSuite("cancel returns Result<void>", async () => {
    const r = await adapter.cancel("exec_1", "u1");
    assertResult(r, "cancel");
  });
  await runSuite("observeExecution returns unsubscribe", async () => {
    const unsub = adapter.observeExecution("exec_1", "u1", () => {});
    if (typeof unsub !== "function") throw new Error("observeExecution should return () => void");
    unsub();
  });
}

export async function run(): Promise<void> {
  // Fake
  await runExecutionContract(new FakeExecutionAdapter(), "FakeExecutionAdapter");
  // Real — stub authority (in-memory)
  const stubEngine = {
    async execute() { return { success: true as const, data: { executionId: "exec_real_1" } }; },
    async getExecution() { return { success: true as const, data: { executionId: "exec_real_1", state: "RUNNING" } }; },
    async pause() { return { success: true as const, data: undefined }; },
    async cancel() { return { success: true as const, data: undefined }; },
  };
  await runExecutionContract(new RealExecutionAdapter(stubEngine as never), "RealExecutionAdapter (stub authority)");
}

// Allow direct run
if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(() => console.log("\n✅ Execution contract PASS")).catch(e => { console.error(e); process.exit(1); });
}
