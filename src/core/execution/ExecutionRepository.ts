/**
 * D07 §51 — Persistence Boundary
 * Repository abstraction — no direct DB dependency
 * MUST survive process death (durable)
 */

import type { Execution } from "./types/ExecutionTypes";
import type { ExecutionJournalEntry } from "./ExecutionEvent";

export interface IExecutionRepository {
  create(execution: Execution): Promise<void>;
  get(executionId: string): Promise<Execution | null>;
  update(execution: Execution): Promise<void>;
  appendJournal(entry: ExecutionJournalEntry): Promise<void>;
  listByState?(state: string): Promise<Execution[]>;
}

/**
 * In-Memory implementation for scaffolding & tests
 * Production: replace with InsForge/LocalDB implementation (D05 structure)
 * MUST be durable in production (D07 §50, §85 SyncQueue durable)
 */
export class InMemoryExecutionRepository implements IExecutionRepository {
  private store = new Map<string, Execution>();
  private journals = new Map<string, ExecutionJournalEntry[]>();

  async create(execution: Execution): Promise<void> {
    if (this.store.has(execution.executionId)) {
      throw new Error(`Duplicate executionId: ${execution.executionId}`);
    }
    this.store.set(execution.executionId, structuredClone(execution));
    this.journals.set(execution.executionId, []);
  }

  async get(executionId: string): Promise<Execution | null> {
    const exec = this.store.get(executionId);
    return exec ? structuredClone(exec) : null;
  }

  async update(execution: Execution): Promise<void> {
    // D07 §98 Atomicity: in production, update + journal should be transactional
    this.store.set(execution.executionId, structuredClone(execution));
  }

  async appendJournal(entry: ExecutionJournalEntry): Promise<void> {
    const list = this.journals.get(entry.executionId) ?? [];
    list.push(structuredClone(entry));
    this.journals.set(entry.executionId, list);
  }

  async listByState(state: string): Promise<Execution[]> {
    return Array.from(this.store.values()).filter(e => e.state === state).map(e => structuredClone(e));
  }

  // Test helpers
  getJournals(executionId: string): ExecutionJournalEntry[] {
    return this.journals.get(executionId) ?? [];
  }

  clear(): void {
    this.store.clear();
    this.journals.clear();
  }
}
