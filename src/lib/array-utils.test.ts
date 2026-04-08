import { describe, it, expect } from "vitest";
import { shuffleArray } from "./array-utils";

describe("shuffleArray", () => {
  it("returns an array with the same length", () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffleArray(input)).toHaveLength(input.length);
  });

  it("contains the same elements as the original", () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffleArray(input).sort()).toEqual([...input].sort());
  });

  it("does not mutate the original array", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffleArray(input);
    expect(input).toEqual(copy);
  });

  it("handles an empty array", () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it("handles a single-element array", () => {
    expect(shuffleArray(["only"])).toEqual(["only"]);
  });

  it("works with arrays of strings", () => {
    const input = ["a", "b", "c", "d"];
    const result = shuffleArray(input);
    expect(result).toHaveLength(4);
    expect(result.sort()).toEqual([...input].sort());
  });
});
