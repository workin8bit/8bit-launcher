/**
 * D07 §10-12 — Execution State Machine
 * Authority: D00 > D03 > D04 > D06 > D07
 * Invariant: No component may mutate state directly — only via ExecutionStateMachine.transition()
 */

export type ExecutionState =
  | "CREATED"
  | "VALIDATING"
  | "READY"
  | "RUNNING"
  | "WAITING_PERMISSION"
  | "WAITING_USER"
  | "WAITING_NETWORK"
  | "WAITING_LIFECYCLE"
  | "VERIFYING"
  | "RECOVERING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "DENIED"
  | "ABORTED";

export type TerminalState = "COMPLETED" | "FAILED" | "CANCELLED" | "DENIED" | "ABORTED";

export const TERMINAL_STATES: ReadonlySet<ExecutionState> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "DENIED",
  "ABORTED",
]);

/**
 * D07 §11 — Valid State Transitions
 * Invalid transition MUST be rejected (fail-closed)
 */
export const VALID_TRANSITIONS: ReadonlyMap<ExecutionState, ReadonlySet<ExecutionState>> = new Map([
  ["CREATED", new Set<ExecutionState>(["VALIDATING"])],
  ["VALIDATING", new Set<ExecutionState>(["READY", "DENIED", "FAILED"])],
  ["READY", new Set<ExecutionState>(["RUNNING", "CANCELLED"])],
  ["RUNNING", new Set<ExecutionState>(["VERIFYING", "WAITING_PERMISSION", "WAITING_USER", "WAITING_NETWORK", "WAITING_LIFECYCLE", "RECOVERING", "FAILED", "CANCELLED"])],
  ["VERIFYING", new Set<ExecutionState>(["RUNNING", "RECOVERING", "COMPLETED", "FAILED"])],
  ["RECOVERING", new Set<ExecutionState>(["RUNNING", "WAITING_USER", "WAITING_NETWORK", "FAILED", "CANCELLED"])],
  ["WAITING_PERMISSION", new Set<ExecutionState>(["RUNNING", "DENIED", "CANCELLED"])],
  ["WAITING_USER", new Set<ExecutionState>(["RUNNING", "CANCELLED"])],
  ["WAITING_NETWORK", new Set<ExecutionState>(["RUNNING", "FAILED", "CANCELLED"])],
  ["WAITING_LIFECYCLE", new Set<ExecutionState>(["RUNNING", "RECOVERING", "CANCELLED"])],
]);

export type TransitionReason =
  | "PLAN_VALIDATED"
  | "PLAN_INVALID"
  | "PERMISSION_DENIED"
  | "PERMISSION_GRANTED"
  | "USER_CONFIRMED"
  | "USER_CONFIRMATION_REQUIRED"
  | "USER_CANCELLED"
  | "NETWORK_AVAILABLE"
  | "NETWORK_LOST"
  | "STEP_SUCCESS"
  | "STEP_FAILED"
  | "STEP_TIMEOUT"
  | "VERIFICATION_PASSED"
  | "VERIFICATION_FAILED"
  | "RETRY"
  | "RECOVER"
  | "CANCEL_REQUESTED"
  | "PROCESS_DEATH"
  | "LIFECYCLE_INTERRUPTED"
  | "SECURITY_VIOLATION"
  | "UNKNOWN_OUTCOME";

export function isValidTransition(from: ExecutionState, to: ExecutionState): boolean {
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed ? allowed.has(to) : false;
}

export function isTerminal(state: ExecutionState): boolean {
  return TERMINAL_STATES.has(state as TerminalState);
}
