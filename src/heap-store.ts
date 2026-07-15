import type { Comparator, QueueStore } from './types.js';
import { PriorityQueue } from './priority-queue.js';

export class HeapStore<T> implements QueueStore<T> {
  private pq: PriorityQueue<T>;
  private listeners = new Set<() => void>();
  constructor(compare: Comparator<T>) {
    this.pq = new PriorityQueue(compare);
  }

  push(value: T): void {
    this.pq.push(value);
    this.notify();
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
    this.notify();
  }

  subscribe(onItem: () => void): () => void {
    this.listeners.add(onItem);
    return () => this.listeners.delete(onItem);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
