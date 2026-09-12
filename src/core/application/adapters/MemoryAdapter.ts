/**
 * D09 §25 — D05 Memory Adapter
 * Embedding & policy remain D05 authority
 */

import type { Result } from "../types/ApplicationTypes";

export interface MemoryAdapter {
  createMemory(payload: { content: string; type: string; userId: string }): Promise<Result<{ id: string }>>;
  searchMemory(params: { query: string; topK?: number; userId: string }): Promise<Result<unknown[]>>;
  getMemory(id: string, userId: string): Promise<Result<unknown>>;
  deleteMemory(id: string, userId: string): Promise<Result<void>>;
  getContext(query: string, userId: string): Promise<Result<unknown>>;
}

export class FakeMemoryAdapter implements MemoryAdapter {
  private store = new Map<string, unknown>();
  async createMemory(payload: { content: string; type: string; userId: string }): Promise<Result<{ id: string }>> {
    if (!payload.content.trim()) {
      return { success: false, error: { code: "VALIDATION_ERROR", messageKey: "memory.contentRequired", retryable: false } };
    }
    const id = `mem_${Date.now()}`;
    this.store.set(id, { id, ...payload });
    return { success: true, data: { id } };
  }
  async searchMemory(): Promise<Result<unknown[]>> { return { success: true, data: [] }; }
  async getMemory(id: string): Promise<Result<unknown>> {
    const m = this.store.get(id);
    if (!m) return { success: false, error: { code: "NOT_FOUND", messageKey: "memory.notFound", retryable: false } };
    return { success: true, data: m };
  }
  async deleteMemory(id: string): Promise<Result<void>> { this.store.delete(id); return { success: true, data: undefined }; }
  async getContext(): Promise<Result<unknown>> { return { success: true, data: {} }; }
}
