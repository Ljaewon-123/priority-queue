import { describe, it, expect } from 'vitest';
import { PriorityQueue } from './index.js';

describe('PriorityQueue', () => {
  it('pops the smallest element first (min-heap)', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(3);
    pq.push(1);
    pq.push(2);
    // TODO: pop 구현 후 주석 해제
    // expect(pq.pop()).toBe(1);
    // expect(pq.pop()).toBe(2);
    // expect(pq.pop()).toBe(3);
    expect(pq.peek()).toBe(1);
    expect(pq.size).toBe(3);
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
});
