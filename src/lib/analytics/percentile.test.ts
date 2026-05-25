import { describe, expect, it } from "vitest";
import { percentile } from "./percentile";

describe("percentile", () => {
  it("returns null for empty input", () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  it("returns the median of [1..5] as 3", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("returns the median of [5,4,3,2,1] as 3 (sort-independent)", () => {
    expect(percentile([5, 4, 3, 2, 1], 0.5)).toBe(3);
  });

  it("returns p90 of [1..10] as 9", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });

  it("clamps the ratio to [0, 1]", () => {
    expect(percentile([1, 2, 3], -1)).toBe(1);
    expect(percentile([1, 2, 3], 5)).toBe(3);
  });

  it("returns the single value for a one-element array", () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.9)).toBe(42);
  });
});
