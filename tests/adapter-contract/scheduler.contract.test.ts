/**
 * D11 — SchedulerAdapter Contract Test
 */
import { FakeSchedulerAdapter } from "../../src/core/application/adapters/SchedulerAdapter";
import { RealSchedulerAdapter } from "../../src/infrastructure/adapters/RealSchedulerAdapter";
import { assertResult, runSuite } from "./helpers";

async function runSchedulerContract(adapter: { schedule:(p:unknown,c:unknown,o?:unknown)=>Promise<unknown>; cancelSchedule:(id:string,uid:string)=>Promise<unknown>; getSchedule:(id:string,uid:string)=>Promise<unknown> }, label: string) {
  console.log(`\nSchedulerAdapter — ${label}`);
  await runSuite("schedule returns Result<{executionId}>", async () => {
    const r = await adapter.schedule({ goal: "test" }, { userId: "u1" }, { priority: "NORMAL" });
    assertResult(r, "schedule");
  });
  await runSuite("cancelSchedule returns Result<void>", async () => {
    const r = await adapter.cancelSchedule("sched_1", "u1");
    assertResult(r, "cancelSchedule");
  });
  await runSuite("getSchedule returns Result", async () => {
    const r = await adapter.getSchedule("sched_1", "u1");
    assertResult(r, "getSchedule");
  });
}

export async function run(): Promise<void> {
  await runSchedulerContract(new FakeSchedulerAdapter(), "FakeSchedulerAdapter");
  const stubScheduler = {
    async schedule() { return { executionId: "sched_real_1" }; },
    async cancelSchedule() {},
    async pauseSchedule() {},
    async resumeSchedule() {},
    async getSchedule() { return { queued: 0 }; },
    observeSchedule() { return () => {}; },
  };
  await runSchedulerContract(new RealSchedulerAdapter(stubScheduler as never), "RealSchedulerAdapter (stub scheduler)");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(()=>console.log("\n✅ Scheduler contract PASS")).catch(e=>{console.error(e);process.exit(1);});
}
