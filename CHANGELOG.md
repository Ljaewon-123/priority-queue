# Changelog

## 1.0.0 (unreleased)

First stable release. The public API is now frozen under semver — breaking changes will only ship in a major version.

### Added

- `AsyncPriorityQueue.take(options?)` — blocking pop that waits until an item is available, with `AbortSignal` support and a polling fallback (`pollInterval`, default 100ms) for stores without notifications.
- `AsyncPriorityQueue.consume(options?)` — async iterator over `take` for `for await` worker loops; aborting the signal ends the loop cleanly.
- Optional `QueueStore.subscribe(onItem)` hook — stores that can signal "new item" (e.g. Redis pub/sub) let waiting consumers wake instantly instead of polling.
- `HeapStore` implements `subscribe`, so local queues never poll.
- `UseQueue` `wait: true` option for `Action.Pop` — the decorated method waits for the next item instead of receiving `undefined` (requires an `AsyncPriorityQueue`).

## 0.3.0

- `AsyncPriorityQueue` + `QueueStore<T>` contract: run the same queue utilities on top of any storage (in-memory, Redis, DB) with sync or async methods.
- `HeapStore` — the in-memory default store wrapping the binary heap.
- `UseQueue` decorators accept an `AsyncPriorityQueue` anywhere a sync queue is accepted.

## 0.2.x

- `Action.From` decorator — replace the queue wholesale with a method's returned iterable (heapify, `O(n)`).
- `PriorityQueue.from(iterable, compare)` and `reset(iterable)` via heapify.
- `isEmpty`, `clear()`, `drain()`.

## 0.1.x

- Initial release: comparator-driven binary-heap `PriorityQueue` (`push`, `pop`, `peek`, `size`).
- `UseQueue` method decorators (`Action.Push`, `Action.Pop`) with dynamic queue refs.
