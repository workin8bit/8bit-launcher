/**
 * Execution Feature — ViewModel (execution-facing projection)
 * D09 §59-60, §153-154 — lifecycle-controlled subscription, no authority mutation
 */
import type { ApplicationFacade } from "../../../core/application/facade/ApplicationFacade";
import type { ExecutionStore } from "../stores/ExecutionStore";
import type { UserContext } from "../../../core/application/types/ApplicationTypes";
import type { ExecutionViewState } from "../../../core/application/types/ProjectionTypes";

export class ExecutionViewModel {
  constructor(
    private facade: ApplicationFacade,
    private store: ExecutionStore,
    private userContext: UserContext
  ) {}

  getViewState(executionId: string): ExecutionViewState | undefined {
    return this.store.get(executionId);
  }

  async onPause(executionId: string): Promise<void> {
    const s = this.store.get(executionId);
    if (!s?.canPause) return;
    await this.facade.pauseTask(executionId, this.userContext);
  }

  async onCancel(executionId: string): Promise<void> {
    const s = this.store.get(executionId);
    if (!s?.canCancel) return;
    await this.facade.cancelTask(executionId, this.userContext);
  }

  async onRetry(executionId: string): Promise<void> {
    const s = this.store.get(executionId);
    if (!s?.canRetry) return;
    await this.facade.executeTask(s.title, this.userContext);
  }

  async refresh(executionId: string): Promise<void> {
    const result = await this.facade.getExecution(executionId, this.userContext);
    if (result.success) {
      // Adapter already projected — store updated via subscription in real wiring
      // This is placeholder for rehydration (process death recovery D09 §55)
    }
  }

  observe(executionId: string, callback: (s: ExecutionViewState | undefined) => void): () => void {
    return this.store.subscribe(() => callback(this.store.get(executionId)));
  }

  dispose(): void {}
}
