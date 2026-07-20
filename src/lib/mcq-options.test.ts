import { describe, expect, it, vi, afterEach } from "vitest";
import type { Question } from "@/types/question";
import {
  optionLabelAtIndex,
  shuffleQuestionOptions,
  withShuffledMcqOptions,
} from "./mcq-options";

function makeMcq(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    module: 1,
    topic: "Test",
    text: "Question?",
    imageUrl: null,
    options: [
      { id: "A", text: "Alpha" },
      { id: "B", text: "Beta" },
      { id: "C", text: "Gamma" },
      { id: "D", text: "Delta" },
    ],
    correctOptionId: "A",
    source: "manual",
    questionType: "mcq",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("optionLabelAtIndex", () => {
  it("maps 0-based indices to A, B, C, …", () => {
    expect(optionLabelAtIndex(0)).toBe("A");
    expect(optionLabelAtIndex(1)).toBe("B");
    expect(optionLabelAtIndex(2)).toBe("C");
    expect(optionLabelAtIndex(25)).toBe("Z");
  });
});

describe("shuffleQuestionOptions", () => {
  it("does not mutate the original question or options array", () => {
    const question = makeMcq();
    const originalOrder = question.options.map((o) => o.id);
    shuffleQuestionOptions(question);
    expect(question.options.map((o) => o.id)).toEqual(originalOrder);
  });

  it("keeps the same option ids and correctOptionId", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const question = makeMcq();
    const shuffled = shuffleQuestionOptions(question);
    expect(shuffled.correctOptionId).toBe("A");
    expect(shuffled.options.map((o) => o.id).sort()).toEqual(["A", "B", "C", "D"]);
    expect(shuffled.options.find((o) => o.id === "A")?.text).toBe("Alpha");
  });

  it("returns open-ended questions unchanged", () => {
    const question = makeMcq({
      questionType: "open-ended",
      options: [],
      correctOptionId: "",
    });
    expect(shuffleQuestionOptions(question)).toBe(question);
  });

  it("returns single-option questions unchanged", () => {
    const question = makeMcq({
      options: [{ id: "A", text: "Only" }],
    });
    expect(shuffleQuestionOptions(question)).toBe(question);
  });
});

describe("withShuffledMcqOptions", () => {
  it("shuffles each question independently", () => {
    const questions = [makeMcq({ id: "q1" }), makeMcq({ id: "q2" })];
    const result = withShuffledMcqOptions(questions);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("q1");
    expect(result[1].id).toBe("q2");
  });
});
