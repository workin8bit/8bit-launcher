/**
 * Tasks Feature — ViewModel (task lifecycle projection)
 * ui → viewmodels → ApplicationFacade
 * No repository, no SyncQueue, no ExecutionEngine
 */
import type { ApplicationFacade } from "../../../core/application/facade/ApplicationFacade";
import type { TasksStore } from "../stores/TasksStore";
import type { UserContext } from "../../../core/application/types/ApplicationTypes";

export class TasksViewModel {
  private abortController: AbortController | null = null;

  constructor(
    private facade: ApplicationFacade,
    private store: TasksStore,
    private userContext: UserContext
  ) {}

  get viewState() {
    return this.store.get();
  }

  // Event → Command: Create task via Facade
  async onCreateTask(goal: string): Promise<{ success: boolean; executionId?: string; errorKey?: string }> {
    const trimmed = goal.trim();
    if (!trimmed) return { success: false, errorKey: "tasks.goalRequired" };
    this.store.setLoading(true);
    const result = await this.facade.executeTask(trimmed, this.userContext);
    this.store.setLoading(false);
    if (result.success) return { success: true, executionId: result.data.executionId };
    return { success: false, errorKey: result.error.messageKey };
  }

  async onCancelTask(executionId: string): Promise<void> {
    await this.facade.cancelTask(executionId, this.userContext);
  }

  subscribe(listener: (s: ReturnType<TasksStore["get"]>) => void): () => void {
    return this.store.subscribe(listener);
  }

  dispose(): void {
    this.abortController?.abort();
  }
}
