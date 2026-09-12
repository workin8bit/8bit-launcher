# D07 Execution Engine — Implementation Scaffolding

> **Status:** SCAFFOLDING — Contract first
> **Authority:** D00 → D01 → D02 → D03 → D04 → D05 → D06 → D07
> **Principle:** `Planner decides WHAT, Engine decides HOW safely`

## Structure

```
src/core/execution/
├── types/
│   ├── ExecutionState.ts      # D07 §10-12 State machine, VALID_TRANSITIONS, fail-closed
│   ├── ExecutionTypes.ts      # Execution, ExecutionContext, StructuredPlan, SideEffectClass
│   ├── ExecutionStep.ts       # PlanStep, VerificationCriteria, TimeoutPolicy, RetryPolicy
│   └── ExecutionResult.ts     # ExecutionError, ToolResult, VerificationResult, ExecutionResult
├── interfaces/
│   ├── IExecutionEngine.ts    # D07 §74
│   ├── IStepExecutor.ts       # D07 §75 (includes IToolExecutor)
│   ├── IPermissionGate.ts     # D07 §76
│   ├── IRecoveryManager.ts    # D07 §40-41
│   └── IVerificationManager.ts# D07 §23
├── ExecutionContext.ts        # D07 §13 factory, isolation, no secrets
├── ExecutionError.ts          # D07 §42-45 normalized errors, fail-closed, NON_RETRYABLE
├── ExecutionEvent.ts          # D07 §46-48 Journal & Audit (no secrets)
├── ExecutionStateMachine.ts   # D07 §10-12, §98 Atomicity, deterministic
├── PermissionGate.ts          # D07 §28-32 fail-closed, re-check, L0-L4
├── PolicyEvaluator.ts         # D07 §102 risk-aware, side effect classification
├── VerificationManager.ts     # D07 §22-24 evidence-based, safe rule evaluator
├── RecoveryManager.ts         # D07 §40-41, §77 deterministic, bounded, no blind retry
├── StepExecutor.ts            # D07 §75 validate→permission→tool→verify→persist
├── ExecutionEngine.ts         # D07 §74 THINK→ACT→VERIFY→RECOVER loop, durable, resume
├── __tests__/
│   ├── ExecutionStateMachine.test.ts
│   └── ExecutionEngine.test.ts # D07 §168 Acceptance Matrix D07-001 s/d D07-030
└── index.ts                   # Barrel export
```

## Contract Guarantees

- **No God Object** (D07 §184): Engine orchestrates, delegates to Validator/StateMachine/Gate/StepExecutor/Verifier/Recovery
- **Deterministic** (D07 §185): Same input + state → predictable decision
- **Fail-closed** (D07 §30, §94): UNKNOWN/ERROR → DENY
- **No bypass**: All paths via `ToolExecutor → D03` and `NativeBridge → D06`
- **Durable**: `PERSIST INTENT → EXECUTE → PERSIST RESULT` (D07 §131)
- **No LLM authority**: Planner output never executed without validation

## Dependencies (D07 §154)

```typescript
interface ExecutionDependencies {
  repository: ExecutionRepository; // create/get/update/appendJournal
  stateMachine: ExecutionStateMachine;
  scheduler: ExecutionScheduler;
  permissionGate: PermissionGate;
  toolExecutor: IToolExecutor; // D03
  verifier: VerificationManager;
  recoveryManager: RecoveryManager;
  clock: Clock; // for deterministic tests
}
```

## MVP Scope (D07 §147)

- Structured Plan validation ✅
- Sequential execution ✅
- Permission Gate (L0-L4 fail-closed) ✅
- Tool execution via D03 ✅
- Android via D06 NativeBridge (mocked in scaffolding) ✅
- Verification (rule-based) ✅
- Retry (bounded, idempotency-aware) ✅
- Cancellation, Timeout, Waiting states ✅
- Durable state + Process-death recovery (IN_FLIGHT → verify) ✅
- Audit & Journal (no secrets) ✅
- Offline-aware (network check) ✅
- Parallel → OPTIONAL post-MVP (sequential default)

## Testing

```bash
npm test -- src/core/execution
```

Covers:
- State transitions (valid/invalid/terminal)
- Plan validation (cyclic, unknown tool)
- Permission (HIGH in Manual → WAITING)
- Recovery (retryable vs non-retryable)
- Process death resume
- Idempotency (no duplicate side effect)
- Security (unknown tool/capability → REJECT)

## Next Steps

1. Implement `ExecutionRepository` with InsForge/LocalDB (D05 structure)
2. Wire `ToolExecutor` to real `ToolRegistry` (D03)
3. Wire `NativeBridge` to `CapabilityRegistry` (D06)
4. Add `ExecutionScheduler` for queue/backpressure (D07 §71-72)
5. Add metrics/observability (D07 §118)

## Invariants (D07 §170)

- EI-01 to EI-25 MUST hold — tested in `__tests__`
- Anti-drift: Any change requiring direct Android/shell/memory bypass → STOP & REPORT to higher contract

## Final Principle

> Think safely. Act only when authorized. Verify reality. Recover conservatively.
