import { describe, expect, it } from "vitest";
import { describeStudentBands } from "./band-display";
import type { PerformanceThresholds } from "./constants";

describe("describeStudentBands", () => {
  it("describes ranges without subtracting one from tied thresholds", () => {
    const thresholds: PerformanceThresholds = {
      student: { basicMin: 70, proficientMin: 70, advancedMin: 85 },
      standard: { basicMin: 70, proficientMin: 70, advancedMin: 85 },
    };

    const bands = describeStudentBands(thresholds);

    expect(bands.find((band) => band.key === "basic")?.range).toBe(
      "70% ≤ accuracy < 70%",
    );
    expect(bands.find((band) => band.key === "proficient")?.range).toBe(
      "70% ≤ accuracy < 85%",
    );
  });

  it("keeps below-basic ranges valid when the basic threshold is zero", () => {
    const thresholds: PerformanceThresholds = {
      student: { basicMin: 0, proficientMin: 70, advancedMin: 85 },
      standard: { basicMin: 0, proficientMin: 70, advancedMin: 85 },
    };

    const bands = describeStudentBands(thresholds);

    expect(bands.find((band) => band.key === "below_basic")?.range).toBe(
      "< 0%",
    );
  });
});
