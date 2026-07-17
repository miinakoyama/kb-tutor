import { describe, expect, it } from "vitest";
import { coverageState, summarizeStandardCoverage } from "@/lib/bkt/coverage";

describe("KC coverage", () => {
  it("distinguishes valid, unresolved, invalid, and excluded questions", () => {
    const base = {
      standardId: "S",
      format: "mcq" as const,
      includeInSelfPractice: true,
      expectedSlots: 1,
      confirmedSlots: 1,
      hasInvalidMapping: false,
      confirmedKcCodes: ["S1"],
    };
    expect(coverageState(base)).toBe("valid");
    expect(coverageState({ ...base, confirmedSlots: 0 })).toBe("unresolved");
    expect(coverageState({ ...base, hasInvalidMapping: true })).toBe("invalid");
    expect(coverageState({ ...base, includeInSelfPractice: false })).toBe("excluded");
  });

  it("blocks activation until every active KC is covered and every eligible item is valid", () => {
    const questions = [
      {
        standardId: "S",
        format: "mcq" as const,
        includeInSelfPractice: true,
        expectedSlots: 1,
        confirmedSlots: 1,
        hasInvalidMapping: false,
        confirmedKcCodes: ["S1"],
      },
    ];
    expect(summarizeStandardCoverage("S", questions, ["S1"]).canActivate).toBe(true);
    expect(summarizeStandardCoverage("S", questions, ["S1", "S2"]).canActivate).toBe(false);
  });
});
