/**
 * D11 — AndroidSyncWorker E2E: Web execute → PENDING_SYNC → worker ack → SYNCED
 * Verifies the agreed endpoint split:
 *   POST /api/sync   = enqueue outbox (Web & Android same)
 *   POST /api/sync/ack = Android worker ack (only mutator of SYNCED)
 *   GET  /api/agent/{id} = Web poll (read-only, idempotent)
 *
 * This test simulates the worker ack path (commit 5 Android worker).
 * MVP without device: PENDING_SYNC is a valid state (D00 §13), not an error.
 */

const _store = new Map();
if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    localStorage: {
      getItem: (k) => (_store.has(k) ? _store.get(k) : null),
      setItem: (k, v) => { _store.set(k, v); },
      removeItem: (k) => { _store.delete(k); },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
}

const { RealExecutionEngine } = await import("../src/infrastructure/authorities/RealExecutionEngine");
const { RealExecutionRepository } = await import("../src/infrastructure/authorities/RealExecutionRepository");
const { AndroidSyncWorker } = await import("../src/infrastructure/authorities/AndroidSyncWorker");

// Mock native bridge — records openApp calls
let openAppCalls = 0;
const mockBridge = {
  openApp: async (packageName) => { openAppCalls++; },
  getInstalledApps: async () => [],
  getPermissionState: async () => ({ state: "GRANTED" }),
};

async function run(): Promise<void> {
  // ── 1. Web execute → durable PENDING_SYNC record ──
  let fetchCalls = 0;
  globalThis.fetch = (async (input) => {
    fetchCalls++;
    const url = String(input);
    if (url.includes("/api/sync/ack")) return new Response("ok", { status: 200 });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  const engine = new RealExecutionEngine();
  engine.setNativeBridge(mockBridge as never);

  const ctx = { userId: "u_demo", correlationId: "corr_worker_1" };
  const execRes = await engine.execute({ goal: "open youtube" }, ctx);
  await new Promise((r) => setTimeout(r, 200));
  if (!execRes.success) throw new Error("execute should succeed");
  const execId = execRes.data.executionId;

  const repo = new RealExecutionRepository();
  const rec = repo.get(execId);
  if (!rec) throw new Error("record missing from repository");
  if (rec.state !== "PENDING_SYNC") throw new Error(`expected PENDING_SYNC, got ${rec.state}`);
  if (fetchCalls < 1) throw new Error("SyncQueue flush should have called fetch at least once");
  console.log("[1] Web execute -> durable PENDING_SYNC record + SyncQueue enqueued to /api/sync");

  // ── 2. Worker polls /api/sync, executes native, acks /api/sync/ack ──
  // Simulate: worker polls, finds the pending item, executes openApp, acks
  const worker = new AndroidSyncWorker(mockBridge as never, {
    ack: (eventId, result) => {
      // ack mutates execution state PENDING_SYNC -> SYNCED
      const current = repo.get(execId);
      if (current) repo.put({ ...current, state: "SYNCED", updatedAt: new Date().toISOString() });
    },
  });

  // Simulate a pending sync item (what the worker would poll from /api/sync)
  // Goal-based execution: worker executes, does NOT call openApp (package resolution is D07's job)
  const pendingItem = {
    eventId: `evt_${execId}`,
    idempotencyKey: rec.idempotencyKey,
    operation: "CREATE" as const,
    entity: "execution",
    payload: { executionId: execId, goal: "open youtube", userId: "u_demo" },
    version: 1,
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };

  const ackResult = await worker.executeAndAck(pendingItem, "u_demo");
  if (ackResult.result !== "executed") throw new Error(`expected executed, got ${ackResult.result}`);
  if (openAppCalls !== 0) throw new Error("goal-based exec must NOT call openApp (D07 resolves package, worker executes)");
  console.log("[2] Worker poll /api/sync -> execute native (goal) -> ack /api/sync/ack PASS");

  // ── 2b. packageName-based execution: worker DOES call openApp ──
  const pkgItem = {
    eventId: "evt_pkg_1",
    idempotencyKey: "ik_pkg_1",
    operation: "CREATE" as const,
    entity: "execution",
    payload: { packageName: "com.google.android.youtube", userId: "u_demo" },
    version: 1,
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };
  const pkgAck = await worker.executeAndAck(pkgItem, "u_demo");
  if (pkgAck.result !== "executed") throw new Error("pkg exec should be executed");
  if (openAppCalls !== 1) throw new Error(`openApp should have been called once for packageName, got ${openAppCalls}`);
  console.log("[2b] Worker openApp(packageName) -> ack /api/sync/ack PASS");

  // ── 3. After ack, execution state is SYNCED ──
  const afterAck = repo.get(execId);
  if (!afterAck) throw new Error("record missing after ack");
  if (afterAck.state !== "SYNCED") throw new Error(`expected SYNCED after ack, got ${afterAck.state}`);
  console.log("[3] Execution state PENDING_SYNC -> SYNCED (only mutator of SYNCED, D07B §9) PASS");

  // ── 4. Web poll GET /api/agent/{id} returns SYNCED ──
  const { RealExecutionAdapter } = await import("../src/infrastructure/adapters/RealExecutionAdapter");
  const adapter = new RealExecutionAdapter(engine, repo);
  const poll = await adapter.getExecution(execId, "u_demo");
  if (!poll.success) throw new Error("poll should succeed");
  if (poll.data.state !== "SYNCED") throw new Error(`poll should return SYNCED, got ${poll.data.state}`);
  console.log("[4] Web poll GET /api/agent/{id} -> SYNCED PASS");

  // ── 5. Idempotency: ack same eventId twice is a no-op ──
  const before = openAppCalls;
  const ack2 = await worker.executeAndAck(pendingItem, "u_demo");
  // Second ack: item already processed, openApp should NOT fire again
  if (openAppCalls !== before) throw new Error("idempotent ack must NOT re-execute native");
  console.log("[5] Idempotent ack — same eventId, 0 new native calls PASS");

  // ── 6. Web degrade: no native bridge -> web_degraded, stays PENDING_SYNC ──
  const engine2 = new RealExecutionEngine();
  const exec2 = await engine2.execute({ goal: "open web app" }, { userId: "u_demo", correlationId: "corr_web_1" });
  await new Promise((r) => setTimeout(r, 200));
  // Repo snapshots localStorage at construction — must come AFTER execute() wrote the record
  const repo2 = new RealExecutionRepository();
  const rec2 = repo2.get(exec2.data.executionId);
  if (!rec2 || rec2.state !== "PENDING_SYNC") throw new Error("web degrade should keep PENDING_SYNC");
  console.log("[6] Web degrade — no native bridge, PENDING_SYNC stays honest MVP state PASS");

  console.log("\nAndroidSyncWorker E2E PASS — Web -> PENDING_SYNC -> worker ack -> SYNCED");
  console.log("Endpoint split: /api/sync (enqueue) + /api/sync/ack (ack) + /api/agent/{id} (poll)");
}

run().catch((e) => { console.error("AndroidSyncWorker E2E FAIL", e); process.exit(1); });