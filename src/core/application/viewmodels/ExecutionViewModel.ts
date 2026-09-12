/**
 * D09 §13-14, §34, §59-60 — ViewModel (Domain/Application → Presentation, Event → Command)
 * ViewModel MUST NOT: write repository, run retry, resolve conflict, call Android, mutate execution state
 * No new Database() — all via ApplicationFacade via DI
 */

import type { ApplicationFacade } from "../facade/ApplicationFacade";
import type { ExecutionViewStore } from "../stores/ExecutionViewStore";
import type { ExecutionViewState } from "../types/ProjectionTypes";
import type { UserContext } from "../types/ApplicationTypes";

export class ExecutionViewModel {
  constructor(
    private facade: ApplicationFacade,
    private store: ExecutionViewStore,
    private userContext: UserContext
  ) {}

  getViewState(executionId: string): ExecutionViewState | undefined {
    return this.store.get(executionId);
  }

  // D09 §13 — UI Event → Command
  async onPause(executionId: string): Promise<void> {
    const state = this.store.get(executionId);
    if (!state?.canPause) return;
    // D09 §53 — duplicate click prevention is ViewModel-level, idempotency is D07B
    await this.facade.pauseTask(executionId, this.userContext);
  }

  async onCancel(executionId: string): Promise<void> {
    const state = this.store.get(executionId);
    if (!state?.canCancel) return;
    await this.facade.cancelTask(executionId, this.userContext);
  }

  async onRetry(executionId: string): Promise<void> {
    const state = this.store.get(executionId);
    if (!state?.canRetry) return;
    // D09 §156 — Retry goes via Command → Service → Authority
    await this.facade.executeTask(state.title, this.userContext);
  }

  // D09 §153 — lifecycle controlled subscription
  observe(executionId: string, callback: (s: ExecutionViewState | undefined) => void): () => void {
    return this.store.subscribe(() => callback(this.store.get(executionId)));
  }

  dispose(): void {
    // D09 §154 — unsubscribe, abort pending
  }
}
