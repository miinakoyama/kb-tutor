import { describe, expect, it } from "vitest";
import { getDistinctActiveDateKeys, hasComebackGap } from "@/lib/badges/streak";

describe("getDistinctActiveDateKeys", () => {
  it("dedupes same-day timestamps and sorts ascending", () => {
    const keys = getDistinctActiveDateKeys(
      ["2026-01-03T10:00:00.000Z", "2026-01-01T09:00:00.000Z", "2026-01-01T20:00:00.000Z"],
      "UTC",
    );
    expect(keys).toEqual(["2026-01-01", "2026-01-03"]);
  });
});

describe("hasComebackGap", () => {
  it("is false when active days are consecutive", () => {
    expect(hasComebackGap(["2026-01-01", "2026-01-02", "2026-01-03"], 7)).toBe(false);
  });

  it("is true when a gap of at least gapDays exists between two active days", () => {
    expect(hasComebackGap(["2026-01-01", "2026-01-08"], 7)).toBe(true);
  });

  it("is false when the gap is smaller than gapDays", () => {
    expect(hasComebackGap(["2026-01-01", "2026-01-06"], 7)).toBe(false);
  });

  it("is false with fewer than two active days", () => {
    expect(hasComebackGap(["2026-01-01"], 7)).toBe(false);
    expect(hasComebackGap([], 7)).toBe(false);
  });
});
