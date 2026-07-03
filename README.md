# @nogaree/priority-queue

A lightweight, TypeScript-first priority queue built on a binary heap.

## Installation

```bash
npm install @nogaree/priority-queue
```

## Usage

The queue is comparator-driven — the same API works as a min-heap, max-heap, or any custom priority.

### Min-heap (smallest value first)

```ts
import { PriorityQueue } from '@nogaree/priority-queue';

const pq = new PriorityQueue<number>((a, b) => a - b);

pq.push(3);
pq.push(1);
pq.push(2);

pq.peek(); // 1  (read without removing)
pq.size; // 3

pq.pop(); // 1
pq.pop(); // 2
pq.pop(); // 3
```

### Max-heap (largest value first)

```ts
const pq = new PriorityQueue<number>((a, b) => b - a);

pq.push(3);
pq.push(1);
pq.push(2);

pq.pop(); // 3
```

### Custom objects

```ts
type Task = { name: string; priority: number };

const pq = new PriorityQueue<Task>((a, b) => a.priority - b.priority);

pq.push({ name: 'low', priority: 10 });
pq.push({ name: 'high', priority: 1 });

pq.pop(); // { name: 'high', priority: 1 }
```

## Method Decorators

Attach a queue to class methods declaratively with `UseQueue`.

**Requirements:** TypeScript 5.0+, no `experimentalDecorators` flag.
NestJS 10+ users: remove `"experimentalDecorators": true` from tsconfig to enable Stage 3 decorator support.

### `Action.Push` — auto-push the return value

The decorated method runs normally, and its return value is automatically pushed to the queue.

```ts
import { PriorityQueue, Action, UseQueue } from '@nogaree/priority-queue';

type Task = { name: string; priority: number };

const queue = new PriorityQueue<Task>((a, b) => a.priority - b.priority);

class TaskScheduler {
  @UseQueue({ action: Action.Push, queue })
  schedule(name: string): Task {
    return { name, priority: Math.random() };
    // return value is automatically pushed to queue
  }
}

const scheduler = new TaskScheduler();
scheduler.schedule('A');
scheduler.schedule('B');

queue.size; // 2
```

### `Action.Pop` — inject the top item as the last argument

Before the method body runs, `queue.pop()` is called and the result is injected as the last parameter. The caller does not pass that argument. If the queue is empty, the injected value is `undefined`.

```ts
const queue = new PriorityQueue<Task>((a, b) => a.priority - b.priority);
queue.push({ name: 'low', priority: 10 });
queue.push({ name: 'high', priority: 1 });

class TaskWorker {
  @UseQueue({ action: Action.Pop, queue })
  process(popped: Task | undefined): void {
    if (!popped) return;
    console.log(`Processing: ${popped.name}`);
  }
}

const worker = new TaskWorker();
worker.process(); // queue.pop() runs first → Processing: high
worker.process(); // queue.pop() runs first → Processing: low
worker.process(); // queue is empty          → (nothing logged)
```

If the method has other parameters, they are passed normally and the popped value is appended last:

```ts
class TaskWorker {
  @UseQueue({ action: Action.Pop, queue })
  process(label: string, popped: Task | undefined): void {
    console.log(label, popped?.name);
    return;
  }
}

worker.process('next'); // label = 'next', popped = queue.pop()
```

### Dynamic queue

Pass a function instead of a queue instance to resolve the queue at call time:

```ts
let activeQueue = new PriorityQueue<Task>((a, b) => a.priority - b.priority);

class Worker {
  @UseQueue({ action: Action.Pop, queue: () => activeQueue })
  process(popped: Task | undefined): void { ... }
}

// Swap the queue at runtime — the decorator picks it up automatically
activeQueue = anotherQueue;
```

### `Action.From` — replace the entire queue with the method's return value (iterable)

When the decorated method returns an iterable (e.g. an array), the queue is replaced wholesale with that result. Internally uses heapify (`O(n)`), which is more efficient than pushing elements one by one (`O(n log n)`).

**Execution order:**

1. The method runs.
2. The queue's contents are fully replaced by the returned iterable (previous contents are discarded).
3. The return value is passed through to the caller unchanged.

```ts
import { PriorityQueue, Action, UseQueue } from '@nogaree/priority-queue';

type Task = { name: string; priority: number };

const queue = new PriorityQueue<Task>((a, b) => a.priority - b.priority);

class TaskLoader {
  @UseQueue({ action: Action.From, queue })
  load(): Task[] {
    // the entire return value is loaded into the queue
    return [
      { name: 'C', priority: 30 },
      { name: 'A', priority: 10 },
      { name: 'B', priority: 20 },
    ];
  }
}

const loader = new TaskLoader();
loader.load();
// queue now holds all 3 items in heapified order

queue.pop(); // { name: 'A', priority: 10 }
queue.pop(); // { name: 'B', priority: 20 }
queue.pop(); // { name: 'C', priority: 30 }
```

Calling `load()` again resets the queue from scratch — previous contents are gone:

```ts
loader.load(); // queue is re-initialized with 3 items
queue.size; // 3
```

Difference from `Action.Push`:

|                         | `Action.Push`             | `Action.From`                   |
| ----------------------- | ------------------------- | ------------------------------- |
| Return type             | `T` (single value)        | `Iterable<T>` (multiple values) |
| Existing queue contents | Preserved (item appended) | Replaced                        |
| Complexity              | O(log n)                  | O(n) heapify                    |

### Push + Pop pipeline

```ts
const queue = new PriorityQueue<Task>((a, b) => a.priority - b.priority);

class Pipeline {
  @UseQueue({ action: Action.Push, queue })
  produce(name: string, priority: number): Task {
    return { name, priority }; // return value is pushed to queue
  }

  @UseQueue({ action: Action.Pop, queue })
  consume(popped: Task | undefined): void {
    if (popped) console.log(`Processing: ${popped.name}`);
  }
}

const p = new Pipeline();
p.produce('A', 30);
p.produce('B', 10);
p.produce('C', 20);

p.consume(); // queue.pop() runs first → Processing: B  (priority 10)
p.consume(); // queue.pop() runs first → Processing: C  (priority 20)
p.consume(); // queue.pop() runs first → Processing: A  (priority 30)
```

## Pluggable storage (Redis / DB)

An in-memory queue is often just a stepping stone — real workloads usually move the queue into a central store like Redis or a database. Instead of rewriting the utility layer each time, implement the `QueueStore<T>` contract for your storage and wrap it in an `AsyncPriorityQueue`. All utilities (`drain`, `reset`, `isEmpty`, `from`, decorators) keep working on top of it.

Every store method may be sync or async (`Awaitable<V> = V | Promise<V>`):

```ts
interface QueueStore<T> {
  push(value: T): Awaitable<void>;
  pop(): Awaitable<T | undefined>;
  peek(): Awaitable<T | undefined>;
  size(): Awaitable<number>;
  clear(): Awaitable<void>;
  reset?(iterable: Iterable<T>): Awaitable<void>; // optional batch replace
}
```

Ordering is the store's responsibility — a Redis sorted set orders by score, so no comparator is needed at the queue level.

### Example: Redis-backed store

```ts
import { AsyncPriorityQueue, type QueueStore } from '@nogaree/priority-queue';

type Job = { id: string; priority: number };

class RedisJobStore implements QueueStore<Job> {
  constructor(
    private redis: RedisClient,
    private key: string
  ) {}

  async push(job: Job) {
    await this.redis.zadd(this.key, job.priority, JSON.stringify(job));
  }
  async pop() {
    const [member] = await this.redis.zpopmin(this.key);
    return member ? (JSON.parse(member) as Job) : undefined;
  }
  async peek() {
    const [member] = await this.redis.zrange(this.key, 0, 0);
    return member ? (JSON.parse(member) as Job) : undefined;
  }
  async size() {
    return this.redis.zcard(this.key);
  }
  async clear() {
    await this.redis.del(this.key);
  }
}

const queue = new AsyncPriorityQueue(new RedisJobStore(redis, 'jobs'));

await queue.push({ id: 'a', priority: 2 });
await queue.push({ id: 'b', priority: 1 });
await queue.pop(); // { id: 'b', priority: 1 }
```

### `HeapStore<T>` — the in-memory default

`HeapStore` wraps the binary heap `PriorityQueue` in the `QueueStore` contract. Use it as a drop-in local store (e.g. in tests) and swap it for a Redis/DB store in production without touching the surrounding code:

```ts
import { AsyncPriorityQueue, HeapStore } from '@nogaree/priority-queue';

const queue = new AsyncPriorityQueue(new HeapStore<number>((a, b) => a - b));
await queue.push(3);
await queue.pop(); // 3
```

### `AsyncPriorityQueue<T>` API

All methods return promises. Unlike the sync `PriorityQueue`, `size` and `isEmpty` are **methods**, not getters — a central store must be queried each time.

| Method                            | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| `push(value): Promise<void>`      | Delegates to `store.push`                                          |
| `pop(): Promise<T \| undefined>`  | Delegates to `store.pop`                                           |
| `peek(): Promise<T \| undefined>` | Delegates to `store.peek`                                          |
| `size(): Promise<number>`         | Delegates to `store.size`                                          |
| `isEmpty(): Promise<boolean>`     | `size() === 0`                                                     |
| `clear(): Promise<void>`          | Delegates to `store.clear`                                         |
| `reset(iterable): Promise<void>`  | Uses `store.reset` if implemented, otherwise `clear` + `push` loop |
| `drain(): Promise<T[]>`           | Pops everything in priority order                                  |
| `static from(iterable, store)`    | Builds a queue on the store and fills it via `reset`               |

### Decorators with an async queue

`UseQueue` accepts an `AsyncPriorityQueue` anywhere it accepts a `PriorityQueue`. With a sync queue the decorated method behaves exactly as before; with an async queue the wrapped method returns a `Promise`:

```ts
const queue = new AsyncPriorityQueue(new RedisJobStore(redis, 'jobs'));

class Worker {
  @UseQueue({ action: Action.Push, queue })
  schedule(id: string): Job {
    return { id, priority: Math.random() };
  }

  @UseQueue({ action: Action.Pop, queue })
  process(popped: Job | undefined): void {
    if (popped) console.log(`Processing: ${popped.id}`);
  }
}

const worker = new Worker();
await worker.schedule('a'); // resolves to the Job after the store push completes
await worker.process(); // store.pop() is awaited, then injected as the last argument
```

## API

### `new PriorityQueue<T>(compare: (a: T, b: T) => number)`

Creates a new priority queue. The comparator follows the same convention as `Array.prototype.sort`: if `compare(a, b) < 0`, `a` comes out first.

### `push(value: T): void`

Adds a value to the queue. `O(log n)`.

### `pop(): T | undefined`

Removes and returns the highest-priority value. Returns `undefined` if the queue is empty. `O(log n)`.

### `peek(): T | undefined`

Returns the highest-priority value without removing it. Returns `undefined` if the queue is empty. `O(1)`.

### `size: number`

The number of elements currently in the queue.

### `isEmpty: boolean`

`true` if the queue has no elements.

```ts
pq.isEmpty; // true
pq.push(1);
pq.isEmpty; // false
```

### `clear(): void`

Removes all elements from the queue. `O(1)`.

```ts
pq.push(1);
pq.push(2);
pq.clear();
pq.size; // 0
```

### `drain(): T[]`

Removes and returns all elements in priority order. The queue is empty after this call. `O(n log n)`.

```ts
const pq = new PriorityQueue<number>((a, b) => a - b);
pq.push(3);
pq.push(1);
pq.push(2);

pq.drain(); // [1, 2, 3]
pq.isEmpty; // true
```

### `reset(iterable: Iterable<T>): void`

Replaces the queue's contents with the given iterable. Keeps the existing comparator and uses heapify internally. `O(n)`.

```ts
const pq = new PriorityQueue<number>((a, b) => a - b);
pq.push(99);

pq.reset([3, 1, 2]);
pq.drain(); // [1, 2, 3]  — 99 is gone
```

### `static PriorityQueue.from<T>(iterable: Iterable<T>, compare: (a: T, b: T) => number): PriorityQueue<T>`

Creates a queue from an existing iterable. Uses the heapify algorithm internally, so it runs in `O(n)` — faster than pushing elements one by one (`O(n log n)`).

```ts
const pq = PriorityQueue.from([3, 1, 4, 1, 5, 9], (a, b) => a - b);

pq.peek(); // 1
pq.drain(); // [1, 1, 3, 4, 5, 9]
```

## License

MIT
