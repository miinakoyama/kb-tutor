import { describe, expect, it } from "vitest";
import {
  selectSampleQuestion,
  type SampleQuestionStats,
} from "./sample-question-server";
import type { QuestionPreview } from "@/lib/analytics/teacher-analytics-types";

const standardId = "S1";
const standardLabel = "Standard 1";

function preview(text: string): QuestionPreview {
  return {
    text,
    imageUrl: null,
    diagram: null,
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correctOptionId: "b",
  };
}

function previews(...ids: string[]): Map<string, QuestionPreview | null> {
  return new Map(ids.map((id) => [id, preview(`Stem ${id}`)]));
}

function stats(map: Record<string, SampleQuestionStats>) {
  return new Map(Object.entries(map));
}

describe("selectSampleQuestion", () => {
  it("returns empty payload when the bank is empty", () => {
    const out = selectSampleQuestion({
      bankQuestionIds: [],
      previews: new Map(),
      inScopeStats: new Map(),
      mode: "random",
      seed: "s",
      skip: 0,
      standardId,
      standardLabel,
    });
    expect(out.questionId).toBeNull();
    expect(out.totalAvailable).toBe(0);
    expect(out.isLast).toBe(true);
  });

  it("returns the only question on skip=0 and isLast=true on skip=1", () => {
    const inputs = previews("q1");
    const first = selectSampleQuestion({
      bankQuestionIds: ["q1"],
      previews: inputs,
      inScopeStats: new Map(),
      mode: "random",
      seed: "s",
      skip: 0,
      standardId,
      standardLabel,
    });
    expect(first.questionId).toBe("q1");
    expect(first.isLast).toBe(true);

    const past = selectSampleQuestion({
      bankQuestionIds: ["q1"],
      previews: inputs,
      inScopeStats: new Map(),
      mode: "random",
      seed: "s",
      skip: 1,
      standardId,
      standardLabel,
    });
    expect(past.questionId).toBeNull();
    expect(past.isLast).toBe(true);
  });

  it("random mode is deterministic with the same seed", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const out = (skip: number) =>
      selectSampleQuestion({
        bankQuestionIds: ids,
        previews: previews(...ids),
        inScopeStats: new Map(),
        mode: "random",
        seed: "fixed-seed-1234",
        skip,
        standardId,
        standardLabel,
      }).questionId!;
    const ordered = [out(0), out(1), out(2), out(3), out(4)];
    expect(new Set(ordered).size).toBe(5);
    // Asking with the same seed/skip gives the same answer.
    expect(out(2)).toBe(ordered[2]);
  });

  it("high_accuracy_first orders by accuracy DESC; unattempted at the end", () => {
    const ids = ["q_hi", "q_mid", "q_lo", "q_un"];
    const out = selectSampleQuestion({
      bankQuestionIds: ids,
      previews: previews(...ids),
      inScopeStats: stats({
        q_hi: { attempted: 5, accuracy: 0.9 },
        q_mid: { attempted: 5, accuracy: 0.6 },
        q_lo: { attempted: 5, accuracy: 0.3 },
      }),
      mode: "high_accuracy_first",
      seed: "s",
      skip: 0,
      standardId,
      standardLabel,
    });
    expect(out.questionId).toBe("q_hi");
    // Walk the full ordering.
    const ordering = ids.map((_, i) =>
      selectSampleQuestion({
        bankQuestionIds: ids,
        previews: previews(...ids),
        inScopeStats: stats({
          q_hi: { attempted: 5, accuracy: 0.9 },
          q_mid: { attempted: 5, accuracy: 0.6 },
          q_lo: { attempted: 5, accuracy: 0.3 },
        }),
        mode: "high_accuracy_first",
        seed: "s",
        skip: i,
        standardId,
        standardLabel,
      }).questionId,
    );
    expect(ordering).toEqual(["q_hi", "q_mid", "q_lo", "q_un"]);
  });

  it("low_accuracy_first reverses attempted ordering; unattempted still at end", () => {
    const ids = ["q_hi", "q_mid", "q_lo", "q_un"];
    const ordering = ids.map((_, i) =>
      selectSampleQuestion({
        bankQuestionIds: ids,
        previews: previews(...ids),
        inScopeStats: stats({
          q_hi: { attempted: 5, accuracy: 0.9 },
          q_mid: { attempted: 5, accuracy: 0.6 },
          q_lo: { attempted: 5, accuracy: 0.3 },
        }),
        mode: "low_accuracy_first",
        seed: "s",
        skip: i,
        standardId,
        standardLabel,
      }).questionId,
    );
    expect(ordering).toEqual(["q_lo", "q_mid", "q_hi", "q_un"]);
  });

  it("tie-break: equal accuracy ranks more-attempted question first", () => {
    const ids = ["q_few", "q_many"];
    const out = selectSampleQuestion({
      bankQuestionIds: ids,
      previews: previews(...ids),
      inScopeStats: stats({
        q_few: { attempted: 2, accuracy: 0.5 },
        q_many: { attempted: 10, accuracy: 0.5 },
      }),
      mode: "high_accuracy_first",
      seed: "s",
      skip: 0,
      standardId,
      standardLabel,
    });
    expect(out.questionId).toBe("q_many");
  });

  it("accuracy modes are stable when no scope stats exist (all unattempted)", () => {
    const ids = ["b", "a", "c"];
    const out = (mode: "high_accuracy_first" | "low_accuracy_first") =>
      selectSampleQuestion({
        bankQuestionIds: ids,
        previews: previews(...ids),
        inScopeStats: new Map(),
        mode,
        seed: "s",
        skip: 0,
        standardId,
        standardLabel,
      }).questionId;
    // Tie-break for unattempted is questionId ASC.
    expect(out("high_accuracy_first")).toBe("a");
    expect(out("low_accuracy_first")).toBe("a");
  });
});
