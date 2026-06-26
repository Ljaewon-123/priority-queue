import { describe, it, expect } from 'vitest';
import { PriorityQueue, Action, UseQueue } from './index.js';

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

  it('isEmpty returns true on empty queue and false otherwise', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    expect(pq.isEmpty).toBe(true);
    pq.push(1);
    expect(pq.isEmpty).toBe(false);
    pq.pop();
    expect(pq.isEmpty).toBe(true);
  });

  it('clear empties the queue', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(1);
    pq.push(2);
    pq.clear();
    expect(pq.size).toBe(0);
    expect(pq.isEmpty).toBe(true);
    expect(pq.pop()).toBeUndefined();
  });

  it('drain returns all elements in priority order and empties the queue', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(3);
    pq.push(1);
    pq.push(2);
    expect(pq.drain()).toEqual([1, 2, 3]);
    expect(pq.isEmpty).toBe(true);
  });

  it('drain on empty queue returns empty array', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    expect(pq.drain()).toEqual([]);
  });

  it('drains many random elements in sorted order', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    const values = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 10000));
    for (const v of values) pq.push(v);

    const drained: number[] = [];
    while (pq.size > 0) drained.push(pq.pop()!);

    expect(drained).toEqual(values.toSorted((a, b) => a - b));
  });
});

// ctx is unused in UseQueue implementation; null satisfies the type slot
const ctx = null as unknown as ClassMethodDecoratorContext;

describe('UseQueue', () => {
  describe('Action.Push', () => {
    it('auto-pushes the return value into the queue', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      const wrapped = UseQueue<number>({ action: Action.Push, queue: pq })(
        () => 42,
        ctx,
      )!;

      wrapped.call(null);
      expect(pq.size).toBe(1);
      expect(pq.pop()).toBe(42);
    });

    it('preserves the return value to the caller', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      const wrapped = UseQueue<number>({ action: Action.Push, queue: pq })(() => 7, ctx)!;

      expect(wrapped.call(null)).toBe(7);
    });

    it('maintains priority order across multiple pushes', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      const low = UseQueue<number>({ action: Action.Push, queue: pq })(() => 10, ctx)!;
      const high = UseQueue<number>({ action: Action.Push, queue: pq })(() => 1, ctx)!;

      low.call(null);
      high.call(null);
      expect(pq.pop()).toBe(1);
      expect(pq.pop()).toBe(10);
    });

    it('works with dynamic queue ref (function)', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      const wrapped = UseQueue<number>({ action: Action.Push, queue: () => pq })(() => 99, ctx)!;

      wrapped.call(null);
      expect(pq.peek()).toBe(99);
    });
  });

  describe('Action.Pop', () => {
    it('injects the top-priority item as the last argument', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      pq.push(3);
      pq.push(1);
      pq.push(2);

      let received: number | undefined;
      const wrapped = UseQueue<number>({ action: Action.Pop, queue: pq })(
        (popped: number | undefined) => {
          received = popped;
        },
        ctx,
      )!;

      wrapped.call(null);
      expect(received).toBe(1);
    });

    it('original args are preserved alongside the injected pop value', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      pq.push(5);

      let receivedArg: string | undefined;
      let receivedPop: number | undefined;
      const wrapped = UseQueue<number>({ action: Action.Pop, queue: pq })(
        (extra: string, popped: number | undefined) => {
          receivedArg = extra;
          receivedPop = popped;
        },
        ctx,
      )!;

      wrapped.call(null, 'hello');
      expect(receivedArg).toBe('hello');
      expect(receivedPop).toBe(5);
    });

    it('injects undefined when queue is empty', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      let received: number | undefined = 99;
      const wrapped = UseQueue<number>({ action: Action.Pop, queue: pq })(
        (popped: number | undefined) => {
          received = popped;
        },
        ctx,
      )!;

      wrapped.call(null);
      expect(received).toBeUndefined();
    });

    it('decreases queue size after pop', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      pq.push(5);
      pq.push(3);
      const wrapped = UseQueue<number>({ action: Action.Pop, queue: pq })(() => {}, ctx)!;

      expect(pq.size).toBe(2);
      wrapped.call(null);
      expect(pq.size).toBe(1);
    });

    it('works with dynamic queue ref (function)', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      pq.push(42);

      let received: number | undefined;
      const wrapped = UseQueue<number>({ action: Action.Pop, queue: () => pq })(
        (popped: number | undefined) => {
          received = popped;
        },
        ctx,
      )!;

      wrapped.call(null);
      expect(received).toBe(42);
    });
  });

  describe('Push + Pop pipeline', () => {
    it('drains items in priority order through a pipeline', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      const log: number[] = [];

      const produce = UseQueue<number>({ action: Action.Push, queue: pq })(
        (value: number) => value,
        ctx,
      )!;
      const consume = UseQueue<number>({ action: Action.Pop, queue: pq })(
        (popped: number | undefined) => {
          if (popped !== undefined) log.push(popped);
        },
        ctx,
      )!;

      produce.call(null, 3);
      produce.call(null, 1);
      produce.call(null, 2);
      consume.call(null);
      consume.call(null);
      consume.call(null);

      expect(log).toEqual([1, 2, 3]);
    });
  });
});
