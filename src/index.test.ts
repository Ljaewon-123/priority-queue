import { describe, it, expect } from 'vitest';
import { PriorityQueue } from './index.js';

describe('PriorityQueue', () => {
  it('pops the smallest element first (min-heap)', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(3);
    pq.push(1);
    pq.push(2);
    expect(pq.pop()).toBe(1);
    expect(pq.pop()).toBe(2);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBeUndefined();
    expect(pq.size).toBe(0);
  });

  it('keeps the smallest at the top as elements are pushed', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(5);
    expect(pq.peek()).toBe(5);
    pq.push(7);
    expect(pq.peek()).toBe(5);
    pq.push(0); // 두 층을 올라가야 하는 케이스
    expect(pq.peek()).toBe(0);
  });

  it('pops the largest element first when the comparator is reversed (max-heap)', () => {
    const pq = new PriorityQueue<number>((a, b) => b - a);
    pq.push(3);
    pq.push(1);
    pq.push(4);
    pq.push(2);
    expect(pq.pop()).toBe(4);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(2);
    expect(pq.pop()).toBe(1);
  });

  it('works as a retry queue: more failures = higher priority', () => {
    type Task = { name: string; failCount: number };
    const pq = new PriorityQueue<Task>((a, b) => b.failCount - a.failCount);

    pq.push({ name: 'a', failCount: 0 });
    pq.push({ name: 'b', failCount: 2 });
    pq.push({ name: 'c', failCount: 1 });

    // 실패가 가장 많은 b가 먼저 나온다
    const task = pq.pop()!;
    expect(task.name).toBe('b');

    // b가 또 실패 → 힙 밖에서 failCount를 올리고 다시 push
    task.failCount += 1;
    pq.push(task);

    // b(3) > c(1) > a(0) 순서로 나와야 한다
    expect(pq.pop()!.name).toBe('b');
    expect(pq.pop()!.name).toBe('c');
    expect(pq.pop()!.name).toBe('a');
  });

  it('drains many random elements in sorted order', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    const values = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 10000));
    for (const v of values) pq.push(v);

    const drained: number[] = [];
    while (pq.size > 0) drained.push(pq.pop()!);

    expect(drained).toEqual([...values].sort((a, b) => a - b));
  });
});
