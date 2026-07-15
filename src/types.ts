export type Comparator<T> = (a: T, b: T) => number;

export type Awaitable<V> = V | Promise<V>;

export interface QueueStore<T> {
  push(value: T): Awaitable<void>;
  pop(): Awaitable<T | undefined>;
  peek(): Awaitable<T | undefined>;
  size(): Awaitable<number>;
  clear(): Awaitable<void>;
  /** Optional batch replace — implement for stores with pipeline/bulk support. */
  reset?(iterable: Iterable<T>): Awaitable<void>;
  /**
   * Optional new-item notification — implement (e.g. with Redis pub/sub) so
   * `take`/`consume` wake immediately instead of polling. Returns an unsubscribe function.
   */
  subscribe?(onItem: () => void): () => void;
}

export interface TakeOptions {
  /** Abort waiting; `take` rejects with `signal.reason`, `consume` ends the loop. */
  signal?: AbortSignal;
  /** Polling interval in ms for stores without `subscribe` (default 100). */
  pollInterval?: number;
}
