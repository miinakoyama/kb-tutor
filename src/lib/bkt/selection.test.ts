import { describe, expect, it } from "vitest";
import { orderTargetKcs, rankQuestionsForKc } from "@/lib/bkt/selection";
import type { AdaptiveKcCandidate, AdaptiveQuestionCandidate } from "@/types/bkt";

const kc = (overrides: Partial<AdaptiveKcCandidate>): AdaptiveKcCandidate => ({
  kcCode: "S1",
  standardId: "S",
  catalogOrder: 1,
  probability: 0.3,
  mastered: false,
  observed: false,
  lastServedAt: null,
  ...overrides,
});

describe("adaptive target selection", () => {
  it("serves unseen KCs in requested standard and catalog order", () => {
    const result = orderTargetKcs({
      candidates: [kc({ kcCode: "T1", standardId: "T" }), kc({ kcCode: "S2", catalogOrder: 2 }), kc({})],
      standardOrder: ["S", "T"],
      cyclePositionByStandard: new Map(),
      standardLastServedAt: new Map(),
      recentKcCodesByStandard: new Map(),
    });
    expect(result).toEqual({ lane: "first_pass", standardId: "S", orderedKcCodes: ["S1", "S2"] });
  });

  it("uses two priority lanes then one least-recent rotation lane", () => {
    const candidates = [kc({ observed: true, probability: 0.8 }), kc({ kcCode: "S2", observed: true, probability: 0.2 })];
    const base = { candidates, standardOrder: ["S"], standardLastServedAt: new Map<string, string | null>(), recentKcCodesByStandard: new Map<string, string[]>() };
    expect(orderTargetKcs({ ...base, cyclePositionByStandard: new Map([["S", 0]]) })?.orderedKcCodes[0]).toBe("S1");
    expect(orderTargetKcs({ ...base, cyclePositionByStandard: new Map([["S", 2]]) })?.orderedKcCodes[0]).toBe("S1");
    candidates[1].lastServedAt = "2026-01-01T00:00:00Z";
    candidates[0].lastServedAt = "2026-02-01T00:00:00Z";
    expect(orderTargetKcs({ ...base, cyclePositionByStandard: new Map([["S", 2]]) })?.orderedKcCodes[0]).toBe("S2");
  });

  it("prevents a third consecutive target when an alternative exists", () => {
    const result = orderTargetKcs({
      candidates: [kc({ observed: true, probability: 0.8 }), kc({ kcCode: "S2", observed: true, probability: 0.7 })],
      standardOrder: ["S"], cyclePositionByStandard: new Map([["S", 0]]), standardLastServedAt: new Map(), recentKcCodesByStandard: new Map([["S", ["S1", "S1"]]]),
    });
    expect(result?.orderedKcCodes[0]).toBe("S2");
  });

  it("uses only the selected standard's recent KC history", () => {
    const result = orderTargetKcs({
      candidates: [
        kc({ kcCode: "S1", standardId: "S", observed: true, probability: 0.8 }),
        kc({ kcCode: "S2", standardId: "S", observed: true, probability: 0.7 }),
        kc({ kcCode: "T1", standardId: "T", observed: true, probability: 0.6 }),
      ],
      standardOrder: ["S", "T"],
      cyclePositionByStandard: new Map([["S", 0], ["T", 0]]),
      standardLastServedAt: new Map([
        ["S", "2026-01-01T00:00:00Z"],
        ["T", "2026-02-01T00:00:00Z"],
      ]),
      recentKcCodesByStandard: new Map([
        ["S", ["S1", "S1"]],
        ["T", ["T1", "T1"]],
      ]),
    });

    expect(result?.standardId).toBe("S");
    expect(result?.orderedKcCodes[0]).toBe("S2");
  });
});

describe("adaptive question ranking", () => {
  const question = (overrides: Partial<AdaptiveQuestionCandidate>): AdaptiveQuestionCandidate => ({
    questionId: "q1", questionSetId: "set", format: "mcq", standardId: "S", targetKcCode: "S1",
    partKcCodes: ["S1"], answered: false, lastAnsweredAt: null, lastServedAt: null, ...overrides,
  });
  it("prefers unseen questions and avoids an immediate repeat", () => {
    const ranked = rankQuestionsForKc([question({ questionId: "q1" }), question({ questionId: "q2" })], "S1", new Set(["S1"]), { questionSetId: "set", questionId: "q1" });
    expect(ranked[0].questionId).toBe("q2");
  });
  it("does not treat the same question id in another set as an immediate repeat", () => {
    const ranked = rankQuestionsForKc([
      question({ questionId: "q1", questionSetId: "set-a" }),
      question({ questionId: "q1", questionSetId: "set-b" }),
    ], "S1", new Set(["S1"]), { questionSetId: "set-a", questionId: "q1" });
    expect(ranked[0].questionSetId).toBe("set-b");
  });
  it("ranks SAQs by distinct additional unmastered KCs, not repeated target parts", () => {
    const ranked = rankQuestionsForKc([
      question({ questionId: "repeat", format: "saq", partKcCodes: ["S1", "S1"] }),
      question({ questionId: "broad", format: "saq", partKcCodes: ["S1", "S2"] }),
    ], "S1", new Set(["S1", "S2"]), null);
    expect(ranked[0].questionId).toBe("broad");
  });
});
