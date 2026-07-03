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
}

export const Action = {
  Push: 'push',
  Pop: 'pop',
  From: 'from',
} as const;
export type Action = (typeof Action)[keyof typeof Action];

type AnyPriorityQueue<T> = PriorityQueue<T> | AsyncPriorityQueue<T>;
type QueueRef<T> = AnyPriorityQueue<T> | (() => AnyPriorityQueue<T>);

interface UseQueueOptions<T> {
  action: Action;
  queue: QueueRef<T>;
}

function resolveQueue<T>(ref: QueueRef<T>): AnyPriorityQueue<T> {
  return typeof ref === 'function' ? ref() : ref;
}

function isThenable(x: unknown): x is Promise<unknown> {
  return typeof (x as PromiseLike<unknown> | undefined)?.then === 'function';
}

export function UseQueue<T>(options: UseQueueOptions<T>) {
  return (value: (...args: any[]) => any, _context: ClassMethodDecoratorContext) => {
    if (options.action === Action.Push) {
      return (...args: any[]) => {
        const result = value(...args) as T;
        const pushed = resolveQueue(options.queue).push(result);
        return isThenable(pushed) ? pushed.then(() => result) : result;
      };
    }

    if (options.action === Action.From) {
      return (...args: any[]) => {
        const result = value(...args) as Iterable<T>;
        const replaced = resolveQueue(options.queue).reset(result);
        return isThenable(replaced) ? replaced.then(() => result) : result;
      };
    }

    return (...args: any[]) => {
      const popped = resolveQueue(options.queue).pop();
      return isThenable(popped) ? popped.then((p) => value(...args, p)) : value(...args, popped);
    };
  };
}

export class PriorityQueue<T> {
  private heap: T[] = [];
  private compare: Comparator<T>;
  constructor(compare: Comparator<T>) {
    this.compare = compare;
  }

  push(value: T): void {
    this.heap.push(value);
    let idx = this.heap.length - 1; // first try end index
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.compare(this.heap[idx], this.heap[parent]) >= 0) return;
      [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
      idx = parent;
    }
    return;
  }

  private siftDown(idx: number): void {
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left >= this.heap.length) return;

      let best = left;
      if (right < this.heap.length && this.compare(this.heap[right], this.heap[left]) < 0) {
        best = right;
      }

      if (this.compare(this.heap[best], this.heap[idx]) >= 0) return;
      [this.heap[idx], this.heap[best]] = [this.heap[best], this.heap[idx]];
      idx = best;
    }
  }

  pop(): T | undefined {
    // 빈 큐(undefined 반환)와 원소 1개(sift-down 불필요)를 한 번에 처리
    if (this.heap.length <= 1) return this.heap.pop();

    const top = this.heap[0];
    this.heap[0] = this.heap.pop()!; // 마지막 원소를 꼭대기로
    this.siftDown(0);
    return top;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  static from<T>(iterable: Iterable<T>, compare: Comparator<T>): PriorityQueue<T> {
    const pq = new PriorityQueue<T>(compare);
    pq.heap = [...iterable];
    for (let i = Math.floor((pq.heap.length - 2) / 2); i >= 0; i--) {
      pq.siftDown(i);
    }
    return pq;
  }

  reset(iterable: Iterable<T>): void {
    this.heap = [...iterable];
    for (let i = Math.floor((this.heap.length - 2) / 2); i >= 0; i--) {
      this.siftDown(i);
    }
  }

  clear(): void {
    this.heap = [];
  }

  drain(): T[] {
    const result: T[] = [];
    while (!this.isEmpty) result.push(this.pop()!);
    return result;
  }
}

export class HeapStore<T> implements QueueStore<T> {
  private pq: PriorityQueue<T>;
  constructor(compare: Comparator<T>) {
    this.pq = new PriorityQueue(compare);
  }

  push(value: T): void {
    this.pq.push(value);
  }

  pop(): T | undefined {
    return this.pq.pop();
  }

  peek(): T | undefined {
    return this.pq.peek();
  }

  size(): number {
    return this.pq.size;
  }

  clear(): void {
    this.pq.clear();
  }

  reset(iterable: Iterable<T>): void {
    this.pq.reset(iterable);
  }
}

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
