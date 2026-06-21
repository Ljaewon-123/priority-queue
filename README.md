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

## License

MIT
