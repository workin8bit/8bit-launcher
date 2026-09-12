/**
 * D11 — RealMemoryAdapter (delegates to D05 MemoryRepository)
 * Adapter only translates — embedding/policy remain D05 authority
 */

import type { MemoryAdapter } from "../../core/application/adapters/MemoryAdapter";
import type { Result } from "../../core/application/types/ApplicationTypes";

// Authority interface — D05
type MemoryRepositoryLike = {
  create(payload: { content: string; type: string; userId: string }): Promise<{ id: string }>;
  search(params: { query: string; topK?: number; userId: string }): Promise<unknown[]>;
  read(id: string, userId: string): Promise<unknown | null>;
  delete(id: string, userId: string): Promise<void>;
  getContext(query: string, userId: string): Promise<unknown>;
};

export class RealMemoryAdapter implements MemoryAdapter {
  constructor(private repo: MemoryRepositoryLike) {}

  async createMemory(payload: { content: string; type: string; userId: string }): Promise<Result<{ id: string }>> {
    try {
      if (!payload.content.trim()) {
        return { success: false, error: { code: "VALIDATION_ERROR", messageKey: "memory.contentRequired", retryable: false } };
      }
      const data = await this.repo.create(payload);
      return { success: true, data };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, error: { code: "MEMORY_ERROR", messageKey: "memory.createFailed", message, retryable: false } };
    }
  }

  async searchMemory(params: { query: string; topK?: number; userId: string }): Promise<Result<unknown[]>> {
    try {
      const data = await this.repo.search(params);
      return { success: true, data };
    } catch {
      return { success: false, error: { code: "MEMORY_ERROR", messageKey: "memory.searchFailed", retryable: false } };
    }
  }

  async getMemory(id: string, userId: string): Promise<Result<unknown>> {
    try {
      const data = await this.repo.read(id, userId);
      if (!data) return { success: false, error: { code: "NOT_FOUND", messageKey: "memory.notFound", retryable: false } };
      return { success: true, data };
    } catch {
      return { success: false, error: { code: "MEMORY_ERROR", messageKey: "memory.readFailed", retryable: false } };
    }
  }

  async deleteMemory(id: string, userId: string): Promise<Result<void>> {
    try {
      await this.repo.delete(id, userId);
      return { success: true, data: undefined };
    } catch {
      return { success: false, error: { code: "MEMORY_ERROR", messageKey: "memory.deleteFailed", retryable: false } };
    }
  }

  async getContext(query: string, userId: string): Promise<Result<unknown>> {
    try {
      const data = await this.repo.getContext(query, userId);
      return { success: true, data };
    } catch {
      return { success: false, error: { code: "MEMORY_ERROR", messageKey: "memory.contextFailed", retryable: false } };
    }
  }
}