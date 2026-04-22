import { describe, expect, it } from "vitest";
import {
  buildWrongCountMap,
  incrementWrongCount,
  prioritizeQuestionsByWrongCount,
} from "./review-priority";

describe("incrementWrongCount", () => {
  it("increments only incorrect attempts", () => {
    const map = new Map<string, number>();
    incrementWrongCount(map, "q1", true);
    incrementWrongCount(map, "q1", false);
    incrementWrongCount(map, "q1", false);

    expect(map.get("q1")).toBe(2);
  });
});

describe("buildWrongCountMap", () => {
  it("counts incorrect attempts per question", () => {
    const map = buildWrongCountMap([
      { questionId: "q1", isCorrect: false },
      { questionId: "q1", isCorrect: true },
      { questionId: "q1", isCorrect: false },
      { questionId: "q2", isCorrect: false },
    ]);

    expect(map.get("q1")).toBe(2);
    expect(map.get("q2")).toBe(1);
  });

  it("omits questions with only correct attempts", () => {
    const map = buildWrongCountMap([{ questionId: "q1", isCorrect: true }]);
    expect(map.has("q1")).toBe(false);
  });
});

describe("prioritizeQuestionsByWrongCount", () => {
  it("prioritizes higher wrong counts first", () => {
    const wrong = new Map<string, number>([
      ["q1", 1],
      ["q2", 3],
      ["q3", 2],
    ]);
    const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

    expect(prioritizeQuestionsByWrongCount(questions, wrong).map((q) => q.id)).toEqual([
      "q2",
      "q3",
      "q1",
    ]);
  });

  it("allows custom tie-break ordering within same wrong count", () => {
    const wrong = new Map<string, number>([
      ["q1", 2],
      ["q2", 2],
    ]);
    const questions = [{ id: "q1" }, { id: "q2" }];

    const prioritized = prioritizeQuestionsByWrongCount(questions, wrong, {
      shuffleWithinSameWrongCount: (bucket) => [...bucket].reverse(),
    });

    expect(prioritized.map((q) => q.id)).toEqual(["q2", "q1"]);
  });
});
