export type Comparator<T> = (a: T, b: T) => number;

export const Action = {
  Push: 'push',
  Pop: 'pop',
} as const;
export type Action = (typeof Action)[keyof typeof Action];

type QueueRef<T> = PriorityQueue<T> | (() => PriorityQueue<T>);

interface UseQueueOptions<T> {
  action: Action;
  queue: QueueRef<T>;
}

function resolveQueue<T>(ref: QueueRef<T>): PriorityQueue<T> {
  return typeof ref === 'function' ? ref() : ref;
}

export function UseQueue<T>(options: UseQueueOptions<T>) {
  return (value: (...args: any[]) => any, _context: ClassMethodDecoratorContext) => {
    if (options.action === Action.Push) {
      return (...args: any[]) => {
        const result = value(...args) as T;
        resolveQueue(options.queue).push(result);
        return result;
      };
    }

    return (...args: any[]) => {
      const popped = resolveQueue(options.queue).pop();
      return value(...args, popped);
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

  clear(): void {
    this.heap = [];
  }

  drain(): T[] {
    const result: T[] = [];
    while (!this.isEmpty) result.push(this.pop()!);
    return result;
  }
}
