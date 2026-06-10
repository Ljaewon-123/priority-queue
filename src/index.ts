export type Comparator<T> = (a: T, b: T) => number;

export class PriorityQueue<T> {
  private heap: T[] = [];
  compare: Comparator<T>;
  constructor(compare: Comparator<T>) {
    this.compare = compare;
  }

  push(): void {
    this.heap.push();
    const len = this.heap.length - 1;
    this.compare(this.heap[len], this.heap[Math.floor(len / 2)]) < 0
      ? (this.heap[len] = this.heap[Math.floor(len / 2)])
      : null;
    return;
  }

  pop(): T | undefined {
    return this.heap.pop();
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  get size(): number {
    return this.heap.length;
  }
}
