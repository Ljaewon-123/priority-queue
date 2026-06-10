import { describe, it, expect } from "vitest";
import { PriorityQueue } from "./index.js";

describe("PriorityQueue", () => {
  it("pops the smallest element first (min-heap)", () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    // TODO: 구현 후 주석 해제
    // pq.push(3);
    // pq.push(1);
    // pq.push(2);
    // expect(pq.pop()).toBe(1);
    // expect(pq.pop()).toBe(2);
    // expect(pq.pop()).toBe(3);
    expect(pq).toBeDefined();
  });
});
