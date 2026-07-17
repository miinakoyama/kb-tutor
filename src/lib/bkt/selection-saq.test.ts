import { describe, expect, it } from "vitest";
import { rankQuestionsForKc } from "@/lib/bkt/selection";
import type { AdaptiveQuestionCandidate } from "@/types/bkt";

const saq = (id: string, partKcCodes: string[], answered = false): AdaptiveQuestionCandidate => ({
  questionId: id,
  questionSetId: "set",
  format: "saq",
  standardId: "S",
  targetKcCode: partKcCodes[0],
  partKcCodes,
  completedCount: answered ? 1 : 0,
  lastCompletedAt: answered ? "2026-01-01T00:00:00Z" : null,
});

describe("multi-KC SAQ ranking", () => {
  it.each([
    ["A", ["S1", "S2"]],
    ["B", ["S2", "S1"]],
    ["C", ["S2", "S3", "S1"]],
  ])("finds target KC in position %s", (_position, parts) => {
    expect(rankQuestionsForKc([saq("q", parts)], "S1", null, "session")).toHaveLength(1);
  });

  it("returns no unrelated SAQ for a missing target", () => {
    expect(rankQuestionsForKc([saq("q", ["S2", "S3"])], "S1", null, "session")).toEqual([]);
  });

  it("prefers an unseen item before an answered item", () => {
    expect(rankQuestionsForKc([saq("old", ["S1"], true), saq("new", ["S1"])], "S1", null, "session")[0].questionId).toBe("new");
  });

  it("does not let additional KC breadth outrank a lower completion count", () => {
    const focused = saq("focused", ["S1"]);
    const broad = { ...saq("broad", ["S1", "S2", "S3"]), completedCount: 1 };
    expect(rankQuestionsForKc([broad, focused], "S1", null, "session")[0].questionId).toBe("focused");
  });
});
