import { describe, expect, it } from "vitest";
import { applyBktObservation, replayBkt } from "@/lib/bkt/calculation";
import { BKT_GOLDEN_FIXTURES, MCQ_PARAMETERS, SAQ_PARAMETERS } from "@/lib/bkt/fixtures";

describe("standard no-forgetting BKT", () => {
  it.each(BKT_GOLDEN_FIXTURES)("matches $name", (fixture) => {
    const parameters = fixture.format === "mcq" ? MCQ_PARAMETERS : SAQ_PARAMETERS;
    const result = applyBktObservation(fixture.initialMastery, fixture.steps[0].correct, {
      ...parameters,
    });
    expect(result.posterior).toBeCloseTo(fixture.steps[0].expectedPosterior, 10);
    expect(result.result).toBeCloseTo(fixture.steps[0].expectedResult, 10);
  });

  it("is deterministic for at least 100 known response sequences", () => {
    for (let mask = 0; mask < 100; mask += 1) {
      const outcomes = Array.from({ length: 7 }, (_, index) => Boolean(mask & (1 << index)));
      expect(replayBkt(outcomes, MCQ_PARAMETERS)).toEqual(replayBkt(outcomes, MCQ_PARAMETERS));
      expect(replayBkt(outcomes, SAQ_PARAMETERS).every((step) => step.result >= 0 && step.result <= 1)).toBe(true);
    }
  });

  it("can reverse mastery after later incorrect evidence", () => {
    const mastered = applyBktObservation(0.96, false, MCQ_PARAMETERS);
    expect(mastered.mastered).toBe(false);
  });

  it("rejects a forgetting model in version 1", () => {
    expect(() => applyBktObservation(0.3, true, { ...MCQ_PARAMETERS, forgettingRate: 0.1 as 0 })).toThrow(
      "no-forgetting",
    );
  });
});
