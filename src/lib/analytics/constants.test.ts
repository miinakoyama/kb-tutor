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

  it("merges partial student override on top of defaults", () => {
    const result = resolvePerformanceThresholds({
      student: { advancedMin: 90 },
    });
    expect(result.student.advancedMin).toBe(90);
    expect(result.student.proficientMin).toBe(
      DEFAULT_PERFORMANCE_THRESHOLDS.student.proficientMin,
    );
    expect(result.standard).toEqual(DEFAULT_PERFORMANCE_THRESHOLDS.standard);
  });

  it("clamps values outside the [0, 100] range", () => {
    const result = resolvePerformanceThresholds({
      student: { advancedMin: 150, basicMin: -25 },
    });
    expect(result.student.advancedMin).toBe(100);
    expect(result.student.basicMin).toBe(0);
  });

  it("rounds non-integer inputs", () => {
    const result = resolvePerformanceThresholds({
      standard: { proficientMin: 72.4 },
    });
    expect(result.standard.proficientMin).toBe(72);
  });
});

describe("validatePerformanceThresholds", () => {
  it("returns null for the defaults", () => {
    expect(validatePerformanceThresholds(DEFAULT_PERFORMANCE_THRESHOLDS)).toBeNull();
  });

  it("rejects out-of-order bands", () => {
    expect(
      validatePerformanceThresholds({
        student: { basicMin: 80, proficientMin: 70, advancedMin: 85 },
        standard: DEFAULT_PERFORMANCE_THRESHOLDS.standard,
      }),
    ).toMatch(/student.*basic.*proficient.*advanced/);
  });

  it("rejects values outside [0, 100]", () => {
    expect(
      validatePerformanceThresholds({
        student: DEFAULT_PERFORMANCE_THRESHOLDS.student,
        standard: { basicMin: -1, proficientMin: 70, advancedMin: 85 },
      }),
    ).toMatch(/standard basic/);
  });

  it("accepts ties (a band can be empty)", () => {
    expect(
      validatePerformanceThresholds({
        student: { basicMin: 70, proficientMin: 70, advancedMin: 85 },
        standard: DEFAULT_PERFORMANCE_THRESHOLDS.standard,
      }),
    ).toBeNull();
  });
});
