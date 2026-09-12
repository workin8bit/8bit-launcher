/**
 * D10A §8, §23-25 — Lifecycle Contract
 * Every feature ViewModel must follow mount → dispose
 */

export type LifecyclePhase = "mount" | "initialize" | "subscribe" | "active" | "suspend" | "resume" | "dispose";

export interface LifecycleContract {
  readonly phase: LifecyclePhase;
  mount(): void;
  initialize(): Promise<void>; // load() or startObserving()
  subscribe(): () => void; // returns unsubscribe
  suspend(): void; // background — stopObserving, keep projection
  resume(): Promise<void>; // foreground — startObserving + refresh
  dispose(): void; // abort + unsubscribe — idempotent
}

export class LifecycleTracker {
  private _phase: LifecyclePhase = "mount";
  get phase(): LifecyclePhase { return this._phase; }

  transition(to: LifecyclePhase): void {
    // Allowed transitions — prevents invalid lifecycle (e.g., active → mount)
    const allowed: Record<LifecyclePhase, LifecyclePhase[]> = {
      mount: ["initialize"],
      initialize: ["subscribe", "dispose"],
      subscribe: ["active", "dispose"],
      active: ["suspend", "dispose"],
      suspend: ["resume", "dispose"],
      resume: ["active", "dispose"],
      dispose: [], // terminal — idempotent
    };
    if (to === "dispose") { this._phase = "dispose"; return; } // dispose is always allowed
    const next = allowed[this._phase];
    if (!next.includes(to)) throw new Error(`Invalid lifecycle transition: ${this._phase} → ${to}`);
    this._phase = to;
  }

  isDisposed(): boolean { return this._phase === "dispose"; }
}
