/**
 * D11 — MemoryAdapter Contract Test
 */
import { FakeMemoryAdapter } from "../../src/core/application/adapters/MemoryAdapter";
import { RealMemoryAdapter } from "../../src/infrastructure/adapters/RealMemoryAdapter";
import { assertResult, runSuite } from "./helpers";

async function runMemoryContract(adapter: { createMemory: (p: {content:string;type:string;userId:string})=>Promise<unknown>; searchMemory:(p:unknown)=>Promise<unknown>; getMemory:(id:string,uid:string)=>Promise<unknown>; deleteMemory:(id:string,uid:string)=>Promise<unknown> }, label: string) {
  console.log(`\nMemoryAdapter — ${label}`);
  await runSuite("createMemory returns Result<{id}> or VALIDATION_ERROR", async () => {
    const r = await adapter.createMemory({ content: "hello", type: "long_term", userId: "u1" });
    assertResult(r, "createMemory valid");
    const bad = await adapter.createMemory({ content: "  ", type: "long_term", userId: "u1" });
    assertResult(bad, "createMemory empty");
    if ((bad as { success: boolean }).success) throw new Error("empty content should be VALIDATION_ERROR");
  });
  await runSuite("searchMemory returns Result<unknown[]>", async () => {
    const r = await adapter.searchMemory({ query: "hello", userId: "u1" });
    assertResult(r, "searchMemory");
  });
  await runSuite("getMemory returns Result (found or NOT_FOUND)", async () => {
    const r = await adapter.getMemory("nonexistent", "u1");
    assertResult(r, "getMemory");
  });
  await runSuite("deleteMemory returns Result<void>", async () => {
    const r = await adapter.deleteMemory("mem_1", "u1");
    assertResult(r, "deleteMemory");
  });
}

export async function run(): Promise<void> {
  await runMemoryContract(new FakeMemoryAdapter(), "FakeMemoryAdapter");
  const stubRepo = {
    async create(p: { content:string }) { if (!p.content.trim()) throw new Error("validation"); return { id: "mem_real_1" }; },
    async search() { return []; },
    async read() { return null; },
    async delete() {},
    async getContext() { return {}; },
  };
  // Real adapter wraps repo — for contract test we use Real with stub repo that still validates
  // Our RealMemoryAdapter does validation itself, so empty should be handled
  await runMemoryContract(new RealMemoryAdapter(stubRepo as never), "RealMemoryAdapter (stub repo)");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(()=>console.log("\n✅ Memory contract PASS")).catch(e=>{console.error(e);process.exit(1);});
}
