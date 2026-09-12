/**
 * D11 — RealMemoryRepository (D05 authority)
 * Local-first: localStorage + InsForge sync
 * Keyword fallback if embedding fails (D05 §45)
 */

const MEMORIES_KEY = "8bitai_memories_v1";

interface MemoryRecord {
  id: string;
  content: string;
  type: "long_term" | "user_knowledge";
  key?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

function loadMemories(): MemoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MEMORIES_KEY);
    return raw ? (JSON.parse(raw) as MemoryRecord[]) : [];
  } catch { return []; }
}

function saveMemories(list: MemoryRecord[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(MEMORIES_KEY, JSON.stringify(list)); } catch { /* skip */ }
}

const INSFORGE_URL = "https://4m4ujzk7.ap-southeast.insforge.app";
const INSFORGE_ANON_KEY = "ik_49de6e3f03e9c9e54042887997fbdf22";

export class RealMemoryRepository {
  private memories = loadMemories();

  async create(payload: { content: string; type: string; userId: string }): Promise<{ id: string }> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: MemoryRecord = {
      id,
      content: payload.content,
      type: payload.type as MemoryRecord["type"],
      key: payload.type === "user_knowledge" ? payload.content.split(":")[0]?.trim() : undefined,
      userId: payload.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.memories.push(record);
    saveMemories(this.memories);
    // Sync to InsForge (fire-and-forget)
    this.syncCreate(record).catch(() => { /* offline */ });
    return { id };
  }

  async search(params: { query: string; topK?: number; userId: string }): Promise<unknown[]> {
    const q = params.query.toLowerCase();
    const topK = params.topK ?? 5;
    return this.memories
      .filter(m => m.userId === params.userId && m.content.toLowerCase().includes(q))
      .slice(0, topK);
  }

  async read(id: string, userId: string): Promise<MemoryRecord | null> {
    return this.memories.find(m => m.id === id && m.userId === userId) ?? null;
  }

  async delete(id: string, userId: string): Promise<void> {
    this.memories = this.memories.filter(m => !(m.id === id && m.userId === userId));
    saveMemories(this.memories);
  }

  async getContext(query: string, userId: string): Promise<unknown> {
    const results = await this.search({ query, topK: 3, userId });
    return { memories: results };
  }

  private async syncCreate(record: MemoryRecord): Promise<void> {
    await fetch(`${INSFORGE_URL}/api/memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INSFORGE_ANON_KEY}`,
      },
      body: JSON.stringify(record),
    });
  }
}