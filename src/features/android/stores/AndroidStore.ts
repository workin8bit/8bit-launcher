/**
 * Android Feature — Store
 * Projection of D06 Android — holds installed apps list
 */
import type { AndroidAppInfo } from "../../../core/application/types/ProjectionTypes";

export interface AndroidViewState {
  apps: AndroidAppInfo[];
  isLoading: boolean;
  error: { messageKey: string } | null;
}

export class AndroidStore {
  private state: AndroidViewState = { apps: [], isLoading: false, error: null };
  private listeners = new Set<(s: AndroidViewState) => void>();

  get(): AndroidViewState {
    return { ...this.state, apps: [...this.state.apps] };
  }

  set(next: AndroidViewState): void {
    this.state = { ...next, apps: [...next.apps] };
    this.emit();
  }

  setLoading(isLoading: boolean): void {
    this.state = { ...this.state, isLoading };
    this.emit();
  }

  subscribe(listener: (s: AndroidViewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.get();
    for (const l of this.listeners) l(snap);
  }
}
