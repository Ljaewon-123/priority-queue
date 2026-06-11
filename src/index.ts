export type Comparator<T> = (a: T, b: T) => number;

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

  pop(): T | undefined {
    // 빈 큐(undefined 반환)와 원소 1개(sift-down 불필요)를 한 번에 처리
    if (this.heap.length <= 1) return this.heap.pop();

    const top = this.heap[0];
    this.heap[0] = this.heap.pop()!; // 마지막 원소를 꼭대기로
    let idx = 0;
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left >= this.heap.length) return top; // 자식 없음 = 맨 아래 도달

      // 두 자식 중 더 우선인 쪽을 고른다
      let best = left;
      if (right < this.heap.length && this.compare(this.heap[right], this.heap[left]) < 0) {
        best = right;
      }

      if (this.compare(this.heap[best], this.heap[idx]) >= 0) return top; // 자식이 못 이김 = 제자리
      [this.heap[idx], this.heap[best]] = [this.heap[best], this.heap[idx]];
      idx = best;
    }
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  get size(): number {
    return this.heap.length;
  }
}
