import type { QueueStore } from '../types.js';

/**
 * Minimal sorted-set command surface the store needs. An `ioredis` client
 * satisfies this as-is; other clients can be adapted with a thin wrapper.
 */
export interface RedisCommands {
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zpopmin(key: string, count?: number): Promise<string[]>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zcard(key: string): Promise<number>;
  del(...keys: string[]): Promise<unknown>;
}

export interface RedisStoreOptions<T> {
  /** Redis client (e.g. an `ioredis` instance). */
  client: RedisCommands;
  /** Sorted-set key backing the queue. */
  key: string;
  /** Maps a value to its priority score — lower scores pop first. */
  score: (value: T) => number;
  /** Member serializer (default `JSON.stringify`). */
  serialize?: (value: T) => string;
  /** Member deserializer (default `JSON.parse`). */
  deserialize?: (raw: string) => T;
}

/**
 * A ready-made `QueueStore` backed by a Redis sorted set. Wrap it in an
 * `AsyncPriorityQueue` and every utility (decorators, `take`, `consume`,
 * `drain`, …) works on top of it.
 *
 * Note: a sorted set is a *set* — two values that serialize to the same
 * member string collapse into one entry. Include a unique id in the payload
 * if duplicates must survive.
 */
export class RedisStore<T> implements QueueStore<T> {
  private client: RedisCommands;
  private key: string;
  private score: (value: T) => number;
  private serialize: (value: T) => string;
  private deserialize: (raw: string) => T;

  constructor(options: RedisStoreOptions<T>) {
    this.client = options.client;
    this.key = options.key;
    this.score = options.score;
    this.serialize = options.serialize ?? ((value) => JSON.stringify(value));
    this.deserialize = options.deserialize ?? ((raw) => JSON.parse(raw) as T);
  }

  async push(value: T): Promise<void> {
    await this.client.zadd(this.key, this.score(value), this.serialize(value));
  }

  async pop(): Promise<T | undefined> {
    const [member] = await this.client.zpopmin(this.key);
    return member === undefined ? undefined : this.deserialize(member);
  }

  async peek(): Promise<T | undefined> {
    const [member] = await this.client.zrange(this.key, 0, 0);
    return member === undefined ? undefined : this.deserialize(member);
  }

  async size(): Promise<number> {
    return this.client.zcard(this.key);
  }

  async clear(): Promise<void> {
    await this.client.del(this.key);
  }

  async reset(iterable: Iterable<T>): Promise<void> {
    await this.client.del(this.key);
    for (const value of iterable) {
      await this.client.zadd(this.key, this.score(value), this.serialize(value));
    }
  }
}
