type Listener = () => void;

/** Minimal store primitive so React can subscribe via useSyncExternalStore. */
export class Emitter {
  private listeners = new Set<Listener>();

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  protected emit(): void {
    // Copy first: a listener may unsubscribe during iteration.
    for (const fn of [...this.listeners]) fn();
  }
}
