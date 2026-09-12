/**
 * D09 §27-28 — Dependency Injection Container
 * Explicit, testable, replaceable, environment-aware, lifecycle-aware
 * Forbidden: new Database() in ViewModel/component
 */

export class Container {
  private registry = new Map<symbol, unknown>();
  private singletons = new Map<symbol, unknown>();

  register<T>(token: symbol, factory: () => T, opts?: { singleton?: boolean }): void {
    if (opts?.singleton) {
      this.singletons.set(token, factory);
    } else {
      this.registry.set(token, factory);
    }
  }

  registerInstance<T>(token: symbol, instance: T): void {
    this.registry.set(token, () => instance);
  }

  resolve<T>(token: symbol): T {
    const singletonFactory = this.singletons.get(token) as (() => T) | undefined;
    if (singletonFactory) {
      if (typeof singletonFactory === "function") {
        const instance = (singletonFactory as () => T)();
        this.singletons.set(token, instance as unknown as () => T); // cache instance
        return instance;
      }
      return singletonFactory as unknown as T;
    }
    const factory = this.registry.get(token) as (() => T) | undefined;
    if (!factory) throw new Error(`No provider for token: ${String(token)}`);
    return (factory as () => T)();
  }

  has(token: symbol): boolean {
    return this.registry.has(token) || this.singletons.has(token);
  }

  dispose(): void {
    // D09 §52 — cleanup resources
    this.registry.clear();
    this.singletons.clear();
  }
}

// Singleton app container — but created explicitly in bootstrap, not hard-coded in features
export function createApplicationContainer(): Container {
  return new Container();
}
