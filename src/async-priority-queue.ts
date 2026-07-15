import type { QueueStore, TakeOptions } from './types.js';

export class AsyncPriorityQueue<T> {
  private store: QueueStore<T>;
  constructor(store: QueueStore<T>) {
    this.store = store;
  }

  async push(value: T): Promise<void> {
    await this.store.push(value);
  }

  async pop(): Promise<T | undefined> {
    return this.store.pop();
  }

  /**
   * Blocking pop: resolves as soon as an item is available. Waits via the
   * store's `subscribe` hook when present, otherwise polls every `pollInterval` ms.
   * Rejects with `signal.reason` when aborted.
   */
  async take(options: TakeOptions = {}): Promise<T> {
    const { signal, pollInterval = 100 } = options;

    while (true) {
      if (signal?.aborted) throw signal.reason;

      // Subscribe before popping so a push landing in between is not missed.
      let wake!: () => void;
      const notified = new Promise<void>((resolve) => {
        wake = resolve;
      });
      const unsubscribe = this.store.subscribe?.(() => wake());

      try {
        const value = await this.store.pop();
        if (value !== undefined) return value;

        let timer: ReturnType<typeof setTimeout> | undefined;
        let onAbort: (() => void) | undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            if (signal?.aborted) {
              reject(signal.reason);
              return;
            }
            if (signal) {
              onAbort = () => reject(signal.reason);
              signal.addEventListener('abort', onAbort, { once: true });
            }
            if (!unsubscribe) timer = setTimeout(resolve, pollInterval);
            void notified.then(resolve);
          });
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          if (onAbort) signal?.removeEventListener('abort', onAbort);
        }
      } finally {
        unsubscribe?.();
      }
    }
  }

  /**
   * Async iteration over `take`: `for await (const item of queue.consume({ signal }))`.
   * Aborting the signal ends the loop cleanly instead of throwing.
   */
  async *consume(options: TakeOptions = {}): AsyncGenerator<T, void, void> {
    const { signal } = options;
    while (true) {
      if (signal?.aborted) return;
      let value: T;
      try {
        value = await this.take(options);
      } catch (error) {
        if (signal?.aborted) return;
        throw error;
      }
      yield value;
    }
  }

  async peek(): Promise<T | undefined> {
    return this.store.peek();
  }

  async size(): Promise<number> {
    return this.store.size();
  }

  async isEmpty(): Promise<boolean> {
    return (await this.store.size()) === 0;
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }

  async reset(iterable: Iterable<T>): Promise<void> {
    if (this.store.reset) {
      await this.store.reset(iterable);
      return;
    }
    await this.store.clear();
    for (const value of iterable) await this.store.push(value);
  }

  async drain(): Promise<T[]> {
    const result: T[] = [];
    while (!(await this.isEmpty())) result.push((await this.pop())!);
    return result;
  }

  static async from<T>(
    iterable: Iterable<T>,
    store: QueueStore<T>
  ): Promise<AsyncPriorityQueue<T>> {
    const queue = new AsyncPriorityQueue(store);
    await queue.reset(iterable);
    return queue;
  }
}
