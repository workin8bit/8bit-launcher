/**
 * Memory Feature — ViewModel (memory-facing projection)
 * D09 §86 — MemoryService → D05 via Facade
 */
import type { ApplicationFacade } from "../../../core/application/facade/ApplicationFacade";
import type { MemoryStore } from "../stores/MemoryStore";
import type { UserContext } from "../../../core/application/types/ApplicationTypes";

export class MemoryViewModel {
  constructor(
    private facade: ApplicationFacade,
    private store: MemoryStore,
    private userContext: UserContext
  ) {}

  get viewState() {
    return this.store.get();
  }

  async onSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    this.store.set({ ...this.store.get(), query: trimmed, isLoading: true, error: null });
    const result = await this.facade.searchMemory(trimmed, this.userContext);
    if (result.success) {
      // Projection already handled by MemoryService — store update placeholder
      this.store.setLoading(false);
    } else {
      this.store.set({ ...this.store.get(), isLoading: false, error: { messageKey: result.error.messageKey } });
    }
  }

  async onCreate(content: string, type: string): Promise<{ success: boolean; id?: string; errorKey?: string }> {
    if (!content.trim()) return { success: false, errorKey: "memory.contentRequired" };
    const result = await this.facade.createMemory(content, type, this.userContext);
    if (result.success) return { success: true, id: result.data.id };
    return { success: false, errorKey: result.error.messageKey };
  }

  subscribe(listener: (s: ReturnType<MemoryStore["get"]>) => void): () => void {
    return this.store.subscribe(listener);
  }

  dispose(): void {}
}
