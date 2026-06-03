import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  resolvePerformanceThresholds,
  validatePerformanceThresholds,
} from "./constants";

describe("resolvePerformanceThresholds", () => {
  it("returns the defaults when override is null", () => {
    expect(resolvePerformanceThresholds(null)).toEqual(
      DEFAULT_PERFORMANCE_THRESHOLDS,
    );
  });

  it("applies a partial override on top of defaults", () => {
    const result = resolvePerformanceThresholds({ advancedMin: 90 });
    expect(result.advancedMin).toBe(90);
    expect(result.proficientMin).toBe(
      DEFAULT_PERFORMANCE_THRESHOLDS.proficientMin,
    );
    expect(result.basicMin).toBe(DEFAULT_PERFORMANCE_THRESHOLDS.basicMin);
  });

  it("clamps values outside the [0, 100] range", () => {
    const result = resolvePerformanceThresholds({
      advancedMin: 150,
      basicMin: -25,
    });
    expect(result.advancedMin).toBe(100);
    expect(result.basicMin).toBe(0);
  });

  it("rounds non-integer inputs", () => {
    const result = resolvePerformanceThresholds({ proficientMin: 72.4 });
    expect(result.proficientMin).toBe(72);
  });
});

describe("validatePerformanceThresholds", () => {
  it("returns null for the defaults", () => {
    expect(validatePerformanceThresholds(DEFAULT_PERFORMANCE_THRESHOLDS)).toBeNull();
  });

  it("rejects out-of-order bands", () => {
    expect(
      validatePerformanceThresholds({
        basicMin: 80,
        proficientMin: 70,
        advancedMin: 85,
      }),
    ).toMatch(/basic.*proficient.*advanced/);
  });

  it("rejects values outside [0, 100]", () => {
    expect(
      validatePerformanceThresholds({
        basicMin: -1,
        proficientMin: 70,
        advancedMin: 85,
      }),
    ).toMatch(/basic/);
  });

  it("accepts ties (a band can be empty)", () => {
    expect(
      validatePerformanceThresholds({
        basicMin: 70,
        proficientMin: 70,
        advancedMin: 85,
      }),
    ).toBeNull();
  });
});
