import type { QueueStore } from '../types.js';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

/**
 * Runs a parameterized statement and resolves with the returned rows
 * (an empty array for statements that return nothing). Adapt your driver:
 * `pg` → `(sql, params) => pool.query(sql, params).then((r) => r.rows)`,
 * `mysql2` → `(sql, params) => pool.query(sql, params).then(([rows]) => rows)`,
 * `better-sqlite3` → `(sql, params) => Promise.resolve(db.prepare(sql).all(...params))`.
 */
export type SqlExecutor = (
  sql: string,
  params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

export interface SqlStoreOptions<T> {
  /** Executes SQL against your database. */
  execute: SqlExecutor;
  /** Maps a value to its priority — lower values pop first. */
  score: (value: T) => number;
  /** Placeholder style and DDL/DML flavor (default `'postgres'`). */
  dialect?: SqlDialect;
  /** Table name (default `'priority_queue'`). Must be a trusted identifier. */
  table?: string;
  /** Payload serializer (default `JSON.stringify`). */
  serialize?: (value: T) => string;
  /** Payload deserializer (default `JSON.parse`). */
  deserialize?: (raw: string) => T;
}

/**
 * A ready-made `QueueStore` backed by a SQL table
 * (`id` auto-increment PK, `priority` float, `payload` text).
 *
 * - `postgres`: `pop` is a single atomic `DELETE … RETURNING` with
 *   `FOR UPDATE SKIP LOCKED`, safe for concurrent consumers.
 * - `sqlite`: `pop` is a single `DELETE … RETURNING` (requires SQLite 3.35+).
 * - `mysql`: `pop` is a select-then-delete pair — wrap the executor in a
 *   transaction if multiple consumers pop concurrently.
 */
export class SqlStore<T> implements QueueStore<T> {
  private execute: SqlExecutor;
  private score: (value: T) => number;
  private dialect: SqlDialect;
  private table: string;
  private serialize: (value: T) => string;
  private deserialize: (raw: string) => T;

  constructor(options: SqlStoreOptions<T>) {
    this.execute = options.execute;
    this.score = options.score;
    this.dialect = options.dialect ?? 'postgres';
    this.table = options.table ?? 'priority_queue';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(this.table)) {
      throw new TypeError(`SqlStore: invalid table name ${JSON.stringify(this.table)}`);
    }
    this.serialize = options.serialize ?? ((value) => JSON.stringify(value));
    this.deserialize = options.deserialize ?? ((raw) => JSON.parse(raw) as T);
  }

  private placeholder(index: number): string {
    return this.dialect === 'postgres' ? `$${index}` : '?';
  }

  /** Creates the backing table (and priority index) if they don't exist. */
  async setup(): Promise<void> {
    const t = this.table;
    if (this.dialect === 'mysql') {
      await this.execute(
        `CREATE TABLE IF NOT EXISTS ${t} (` +
          `id BIGINT AUTO_INCREMENT PRIMARY KEY, ` +
          `priority DOUBLE NOT NULL, ` +
          `payload TEXT NOT NULL, ` +
          `INDEX ${t}_priority_idx (priority, id))`,
        []
      );
      return;
    }
    const idColumn =
      this.dialect === 'postgres'
        ? 'id BIGSERIAL PRIMARY KEY'
        : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
    const priorityType = this.dialect === 'postgres' ? 'DOUBLE PRECISION' : 'REAL';
    await this.execute(
      `CREATE TABLE IF NOT EXISTS ${t} (${idColumn}, priority ${priorityType} NOT NULL, payload TEXT NOT NULL)`,
      []
    );
    await this.execute(`CREATE INDEX IF NOT EXISTS ${t}_priority_idx ON ${t} (priority, id)`, []);
  }

  async push(value: T): Promise<void> {
    await this.execute(
      `INSERT INTO ${this.table} (priority, payload) VALUES (${this.placeholder(1)}, ${this.placeholder(2)})`,
      [this.score(value), this.serialize(value)]
    );
  }

  async pop(): Promise<T | undefined> {
    const t = this.table;
    if (this.dialect === 'mysql') {
      const rows = await this.execute(
        `SELECT id, payload FROM ${t} ORDER BY priority, id LIMIT 1`,
        []
      );
      const row = rows[0];
      if (!row) return undefined;
      await this.execute(`DELETE FROM ${t} WHERE id = ${this.placeholder(1)}`, [row.id]);
      return this.deserialize(row.payload as string);
    }
    const lock = this.dialect === 'postgres' ? ' FOR UPDATE SKIP LOCKED' : '';
    const rows = await this.execute(
      `DELETE FROM ${t} WHERE id = (SELECT id FROM ${t} ORDER BY priority, id LIMIT 1${lock}) RETURNING payload`,
      []
    );
    const row = rows[0];
    return row ? this.deserialize(row.payload as string) : undefined;
  }

  async peek(): Promise<T | undefined> {
    const rows = await this.execute(
      `SELECT payload FROM ${this.table} ORDER BY priority, id LIMIT 1`,
      []
    );
    const row = rows[0];
    return row ? this.deserialize(row.payload as string) : undefined;
  }

  async size(): Promise<number> {
    const rows = await this.execute(`SELECT COUNT(*) AS count FROM ${this.table}`, []);
    return Number(rows[0]?.count ?? 0);
  }

  async clear(): Promise<void> {
    await this.execute(`DELETE FROM ${this.table}`, []);
  }
}
