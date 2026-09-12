/**
 * D09 §6-8, §86 — MemoryService → D05
 */

import type { ApplicationCommand, Result } from "../types/ApplicationTypes";
import type { MemoryAdapter } from "../adapters/MemoryAdapter";

export class MemoryService {
  constructor(private memoryAdapter: MemoryAdapter) {}

  async createMemory(command: ApplicationCommand<{ content: string; type: string }>): Promise<Result<{ id: string }>> {
    if (!command.payload.content?.trim()) {
      return { success: false, error: { code: "VALIDATION_ERROR", messageKey: "memory.contentRequired", retryable: false } };
    }
    return this.memoryAdapter.createMemory({ content: command.payload.content, type: command.payload.type, userId: command.userContext.userId });
  }

  async searchMemory(userId: string, query: string): Promise<Result<unknown[]>> {
    return this.memoryAdapter.searchMemory({ query, userId });
  }
}
