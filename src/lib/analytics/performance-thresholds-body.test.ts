import { describe, expect, it } from "vitest";
import { parsePerformanceThresholdsBody } from "./performance-thresholds-body";

describe("parsePerformanceThresholdsBody", () => {
  it("accepts a flat threshold payload", () => {
    expect(
      parsePerformanceThresholdsBody({
        basicMin: 50,
        proficientMin: 70,
        advancedMin: 85,
      }),
    ).toEqual({
      ok: true,
      body: { basicMin: 50, proficientMin: 70, advancedMin: 85 },
    });
  });

  it("accepts a nested student payload without top-level threshold fields", () => {
    expect(
      parsePerformanceThresholdsBody({
        student: { basicMin: 55, proficientMin: 72, advancedMin: 88 },
      }),
    ).toEqual({
      ok: true,
      body: { basicMin: 55, proficientMin: 72, advancedMin: 88 },
    });
  });

  it("falls back to nested standard when student is absent", () => {
    expect(
      parsePerformanceThresholdsBody({
        standard: { basicMin: 60, proficientMin: 75, advancedMin: 90 },
      }),
    ).toEqual({
      ok: true,
      body: { basicMin: 60, proficientMin: 75, advancedMin: 90 },
    });
  });

  it("prefers flat fields when both flat and nested shapes are present", () => {
    expect(
      parsePerformanceThresholdsBody({
        basicMin: 50,
        proficientMin: 70,
        advancedMin: 85,
        student: { basicMin: 99, proficientMin: 99, advancedMin: 99 },
      }),
    ).toEqual({
      ok: true,
      body: { basicMin: 50, proficientMin: 70, advancedMin: 85 },
    });
  });
});
