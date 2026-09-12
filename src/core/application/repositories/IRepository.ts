/**
 * D09 §18-20, §105 — Repository Boundary
 * Frontend never knows DB details — interface is boundary
 * Mutation: Service → Repository → Local commit → D07B SyncQueue (implicit)
 */

export interface IRepository<T, TCreate = Partial<T>> {
  read(id: string, userContext: { userId: string }): Promise<T | null>;
  list(params: Record<string, unknown> & { userId: string }): Promise<T[]>;
  observe?(id: string, callback: (value: T | null) => void): () => void; // for reactive projection
}

// For mutations that need sync, repository implementation enqueues to D07B internally
export interface IMutableRepository<T, TCreate = Partial<T>> extends IRepository<T, TCreate> {
  create(entity: TCreate & { userId: string }): Promise<T>;
  update(id: string, patch: Partial<T> & { userId: string }): Promise<T>;
  delete(id: string, userContext: { userId: string }): Promise<void>;
}

// Example entity types — minimal, sanitized
export interface TaskEntity {
  id: string;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}
