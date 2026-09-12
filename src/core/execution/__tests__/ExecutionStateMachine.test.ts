/**
 * D07 §161 — State Machine Tests
 * Valid/invalid transitions, terminal mutation, duplicate
 */

import { ExecutionStateMachine } from "../ExecutionStateMachine";
import type { Execution } from "../types/ExecutionTypes";

// Mock repository
const createMockRepo = () => ({
  update: jest.fn(async () => {}),
  appendJournal: jest.fn(async () => {}),
});

const baseExecution = (state: string): Execution => ({
  executionId: "exec_test",
  planId: "plan_1",
  planVersion: "1.0",
  plan: { planId: "plan_1", version: "1.0", goal: "test", steps: [] },
  context: {
    executionId: "exec_test",
    planId: "plan_1",
    planVersion: "1.0",
    sessionId: "sess_1",
    actor: { userId: "user_1", sessionId: "sess_1", actorType: "agent" },
    permission: { autonomyLevel: "Assisted", grantedPermissions: [] },
    environment: { networkAvailable: true },
    variables: {},
    metadata: { createdAt: new Date().toISOString(), correlationId: "corr_1" },
    contextVersion: "1.0",
  },
  state: state as import("../types/ExecutionState").ExecutionState,
  completedSteps: [],
  pendingSteps: [],
  variables: {},
  attemptCounters: {},
  retryState: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  executionSchemaVersion: "1.0",
});

describe("ExecutionStateMachine", () => {
  test("valid transition CREATED → VALIDATING", async () => {
    const repo = createMockRepo();
    const sm = new ExecutionStateMachine(repo);
    const exec = baseExecution("CREATED");
    const next = await sm.transition(exec, "VALIDATING", "PLAN_VALIDATED");
    expect(next.state).toBe("VALIDATING");
  });

  test("invalid transition CREATED → RUNNING should reject", async () => {
    const repo = createMockRepo();
    const sm = new ExecutionStateMachine(repo);
    const exec = baseExecution("CREATED");
    await expect(sm.transition(exec, "RUNNING", "STEP_SUCCESS")).rejects.toThrow("Invalid transition");
  });

  test("terminal state cannot transition", async () => {
    const repo = createMockRepo();
    const sm = new ExecutionStateMachine(repo);
    const exec = baseExecution("COMPLETED");
    await expect(sm.transition(exec, "RUNNING", "RETRY")).rejects.toThrow("terminal state");
  });

  test("VALIDATING → DENIED is valid (permission fail-closed)", async () => {
    const repo = createMockRepo();
    const sm = new ExecutionStateMachine(repo);
    const exec = baseExecution("VALIDATING");
    const next = await sm.transition(exec, "DENIED", "PERMISSION_DENIED");
    expect(next.state).toBe("DENIED");
  });
});
