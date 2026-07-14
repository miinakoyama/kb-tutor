import { describe, expect, it } from "vitest";
import {
  getQuestionHistory,
  questionHistoryKey,
} from "@/lib/bkt/question-history";

describe("adaptive question history identity", () => {
  it("keeps duplicate question ids separate across sets", () => {
    const history = new Map([
      [questionHistoryKey("set-a", "q1"), "answered-a"],
    ]);

    expect(getQuestionHistory(history, "set-a", "q1")).toEqual({
      found: true,
      value: "answered-a",
    });
    expect(getQuestionHistory(history, "set-b", "q1")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("uses question-only history for legacy rows without a set id", () => {
    const history = new Map([
      [questionHistoryKey(null, "q1"), "legacy-answer"],
    ]);

    expect(getQuestionHistory(history, "set-b", "q1")).toEqual({
      found: true,
      value: "legacy-answer",
    });
  });
});
