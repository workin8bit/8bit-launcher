/**
 * D11 — Adapter Contract Runner — runs all 5 adapter contract suites for Fake + Real
 * Ensures Adapter Contract preservation: same interface, same Result shape
 */

import { run as runExecution } from "./execution.contract.test";
import { run as runSync } from "./sync.contract.test";
import { run as runMemory } from "./memory.contract.test";
import { run as runAndroid } from "./android.contract.test";
import { run as runScheduler } from "./scheduler.contract.test";

async function main(): Promise<void> {
  console.log("D11 Adapter Contract Suite — Fake + Real (stub authority) — must PASS for D11");
  console.log("=".repeat(70));
  await runExecution();
  await runSync();
  await runMemory();
  await runAndroid();
  await runScheduler();
  console.log("\n" + "=".repeat(70));
  console.log("✅ All Adapter Contracts PASS — Fake and Real preserve same contract");
  console.log("   ViewModel/Store/UI unchanged — only bootstrap DI switches");
}

main().catch(e => {
  console.error("\n❌ Adapter Contract FAIL", e);
  process.exit(1);
});
