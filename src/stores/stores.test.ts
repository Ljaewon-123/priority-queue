import { describe, it, expect } from 'vitest';
import { AsyncPriorityQueue } from '../async-priority-queue.js';
import { RedisStore, type RedisCommands } from './redis-store.js';
import { SqlStore, type SqlExecutor } from './sql-store.js';

type Job = { id: string; priority: number };
const byPriority = (job: Job) => job.priority;

/** In-memory fake of the sorted-set commands RedisStore uses. */
function fakeRedis(): RedisCommands {
  const sets = new Map<string, Map<string, number>>();
  const sorted = (key: string) =>
    [...(sets.get(key) ?? new Map<string, number>())].toSorted(
      (a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)
    );
  return {
    async zadd(key, score, member) {
      if (!sets.has(key)) sets.set(key, new Map());
      sets.get(key)!.set(member, score);
    },
    async zpopmin(key) {
      const first = sorted(key)[0];
      if (!first) return [];
      sets.get(key)!.delete(first[0]);
      return [first[0], String(first[1])];
    },
    async zrange(key, start, stop) {
      return sorted(key)
        .slice(start, stop + 1)
        .map(([member]) => member);
    },
    async zcard(key) {
      return sets.get(key)?.size ?? 0;
    },
    async del(...keys) {
      for (const key of keys) sets.delete(key);
    },
  };
}

describe('RedisStore', () => {
  it('pushes and pops by score through AsyncPriorityQueue', async () => {
    const store = new RedisStore<Job>({
      client: fakeRedis(),
      key: 'jobs',
      score: byPriority,
    });
    const queue = new AsyncPriorityQueue(store);

    await queue.push({ id: 'low', priority: 10 });
    await queue.push({ id: 'high', priority: 1 });
    await queue.push({ id: 'mid', priority: 5 });

    expect(await queue.size()).toBe(3);
    expect((await queue.peek())?.id).toBe('high');
    expect((await queue.pop())?.id).toBe('high');
    expect((await queue.pop())?.id).toBe('mid');
    expect((await queue.pop())?.id).toBe('low');
    expect(await queue.pop()).toBeUndefined();
  });

  it('supports reset, clear, and drain', async () => {
    const store = new RedisStore<Job>({
      client: fakeRedis(),
      key: 'jobs',
      score: byPriority,
    });
    const queue = new AsyncPriorityQueue(store);

    await queue.push({ id: 'stale', priority: 0 });
    await queue.reset([
      { id: 'b', priority: 2 },
      { id: 'a', priority: 1 },
    ]);
    expect(await queue.drain()).toEqual([
      { id: 'a', priority: 1 },
      { id: 'b', priority: 2 },
    ]);

    await queue.push({ id: 'x', priority: 1 });
    await queue.clear();
    expect(await queue.isEmpty()).toBe(true);
  });

  it('honors custom serializers', async () => {
    const store = new RedisStore<number>({
      client: fakeRedis(),
      key: 'nums',
      score: (n) => n,
      serialize: (n) => `n:${n}`,
      deserialize: (raw) => Number(raw.slice(2)),
    });
    await store.push(7);
    expect(await store.pop()).toBe(7);
  });
});

/** In-memory fake executor covering the statements SqlStore issues. */
function fakeSqlDb(): SqlExecutor {
  type Row = { id: number; priority: number; payload: string };
  let rows: Row[] = [];
  let nextId = 1;
  const first = () => rows.toSorted((a, b) => a.priority - b.priority || a.id - b.id)[0];

  return async (sql, params) => {
    if (sql.startsWith('CREATE')) return [];
    if (sql.startsWith('INSERT')) {
      rows.push({ id: nextId++, priority: params[0] as number, payload: params[1] as string });
      return [];
    }
    if (sql.startsWith('SELECT COUNT')) return [{ count: rows.length }];
    if (sql.startsWith('SELECT id, payload')) {
      const row = first();
      return row ? [{ id: row.id, payload: row.payload }] : [];
    }
    if (sql.startsWith('SELECT payload')) {
      const row = first();
      return row ? [{ payload: row.payload }] : [];
    }
    if (sql.startsWith('DELETE') && sql.includes('RETURNING')) {
      const row = first();
      if (!row) return [];
      rows = rows.filter((r) => r.id !== row.id);
      return [{ payload: row.payload }];
    }
    if (sql.startsWith('DELETE') && sql.includes('WHERE id =')) {
      rows = rows.filter((r) => r.id !== params[0]);
      return [];
    }
    if (sql.startsWith('DELETE')) {
      rows = [];
      return [];
    }
    throw new Error(`fakeSqlDb: unhandled statement: ${sql}`);
  };
}

describe.each(['postgres', 'mysql', 'sqlite'] as const)('SqlStore (%s)', (dialect) => {
  it('pushes and pops by priority through AsyncPriorityQueue', async () => {
    const store = new SqlStore<Job>({ execute: fakeSqlDb(), dialect, score: byPriority });
    await store.setup();
    const queue = new AsyncPriorityQueue(store);

    await queue.push({ id: 'low', priority: 10 });
    await queue.push({ id: 'high', priority: 1 });
    await queue.push({ id: 'mid', priority: 5 });

    expect(await queue.size()).toBe(3);
    expect((await queue.peek())?.id).toBe('high');
    expect(await queue.drain()).toEqual([
      { id: 'high', priority: 1 },
      { id: 'mid', priority: 5 },
      { id: 'low', priority: 10 },
    ]);
    expect(await queue.pop()).toBeUndefined();
  });

  it('clears all rows', async () => {
    const store = new SqlStore<Job>({ execute: fakeSqlDb(), dialect, score: byPriority });
    await store.push({ id: 'a', priority: 1 });
    await store.push({ id: 'b', priority: 2 });
    await store.clear();
    expect(await store.size()).toBe(0);
  });
});

describe('SqlStore validation', () => {
  it('rejects table names that are not plain identifiers', () => {
    expect(
      () =>
        new SqlStore<Job>({
          execute: fakeSqlDb(),
          score: byPriority,
          table: 'jobs; DROP TABLE users',
        })
    ).toThrow(TypeError);
  });

  it('uses numbered placeholders for postgres and ? otherwise', async () => {
    const captured: string[] = [];
    const capture: SqlExecutor = async (sql) => {
      captured.push(sql);
      return [];
    };
    await new SqlStore<Job>({ execute: capture, dialect: 'postgres', score: byPriority }).push({
      id: 'a',
      priority: 1,
    });
    await new SqlStore<Job>({ execute: capture, dialect: 'sqlite', score: byPriority }).push({
      id: 'a',
      priority: 1,
    });
    expect(captured[0]).toContain('$1');
    expect(captured[1]).toContain('?');
  });
});
