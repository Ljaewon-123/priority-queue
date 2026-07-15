import type { PriorityQueue } from './priority-queue.js';
import { AsyncPriorityQueue } from './async-priority-queue.js';

export const Action = {
  Push: 'push',
  Pop: 'pop',
  From: 'from',
} as const;
export type Action = (typeof Action)[keyof typeof Action];

type AnyPriorityQueue<T> = PriorityQueue<T> | AsyncPriorityQueue<T>;
type QueueRef<T> = AnyPriorityQueue<T> | (() => AnyPriorityQueue<T>);

interface UseQueueOptions<T> {
  action: Action;
  queue: QueueRef<T>;
  /**
   * `Action.Pop` only: wait for an item instead of injecting `undefined` when
   * the queue is empty. Requires an `AsyncPriorityQueue`.
   */
  wait?: boolean;
}

function resolveQueue<T>(ref: QueueRef<T>): AnyPriorityQueue<T> {
  return typeof ref === 'function' ? ref() : ref;
}

function isThenable(x: unknown): x is Promise<unknown> {
  return typeof (x as PromiseLike<unknown> | undefined)?.then === 'function';
}

export function UseQueue<T>(options: UseQueueOptions<T>) {
  return (value: (...args: any[]) => any, _context: ClassMethodDecoratorContext) => {
    if (options.action === Action.Push) {
      return (...args: any[]) => {
        const result = value(...args) as T;
        const pushed = resolveQueue(options.queue).push(result);
        return isThenable(pushed) ? pushed.then(() => result) : result;
      };
    }

    if (options.action === Action.From) {
      return (...args: any[]) => {
        const result = value(...args) as Iterable<T>;
        const replaced = resolveQueue(options.queue).reset(result);
        return isThenable(replaced) ? replaced.then(() => result) : result;
      };
    }

    return (...args: any[]) => {
      const queue = resolveQueue(options.queue);
      if (options.wait) {
        if (!(queue instanceof AsyncPriorityQueue)) {
          throw new TypeError('UseQueue: `wait: true` requires an AsyncPriorityQueue');
        }
        return queue.take().then((popped) => value(...args, popped));
      }
      const popped = queue.pop();
      return isThenable(popped) ? popped.then((p) => value(...args, p)) : value(...args, popped);
    };
  };
}
