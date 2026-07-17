import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMixedQuestionSequence, requiredFormatForSelection } from "./question-type-sequence";
import type { Question } from "@/types/question";

function makeQuestion(
  id: string,
  questionType: "mcq" | "open-ended",
  questionSetId?: string,
): Question {
  return {
    id,
    questionSetId,
    module: 1,
    topic: "Test",
    text: `Question ${id}`,
    imageUrl: null,
    options: [],
    correctOptionId: "a",
    questionType,
    source: "manual",
  };
}

function countByType(questions: Question[]) {
  return {
    mcq: questions.filter((q) => q.questionType !== "open-ended").length,
    saq: questions.filter((q) => q.questionType === "open-ended").length,
  };
}

describe("buildMixedQuestionSequence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("follows the 3 MCQ : 1 SAQ repeating pattern when both pools are plentiful", () => {
    const mcqs = Array.from({ length: 20 }, (_, i) => makeQuestion(`mcq-${i}`, "mcq"));
    const saqs = Array.from({ length: 20 }, (_, i) => makeQuestion(`saq-${i}`, "open-ended"));
    const sequence = buildMixedQuestionSequence([...mcqs, ...saqs], 8);

    expect(sequence).toHaveLength(8);
    sequence.forEach((question, index) => {
      const isSaqSlot = index % 4 === 3;
      expect(question.questionType === "open-ended").toBe(isSaqSlot);
    });
  });

  it("never repeats an SAQ while fresh ones remain", () => {
    const mcqs = Array.from({ length: 20 }, (_, i) => makeQuestion(`mcq-${i}`, "mcq"));
    const saqs = Array.from({ length: 3 }, (_, i) => makeQuestion(`saq-${i}`, "open-ended"));
    const sequence = buildMixedQuestionSequence([...mcqs, ...saqs], 12);

    const saqIdsServed = sequence.filter((q) => q.questionType === "open-ended").map((q) => q.id);
    expect(new Set(saqIdsServed).size).toBe(saqIdsServed.length);
    expect(saqIdsServed.length).toBe(3);
  });

  it("falls back to MCQ once the SAQ pool is exhausted", () => {
    const mcqs = Array.from({ length: 20 }, (_, i) => makeQuestion(`mcq-${i}`, "mcq"));
    const saqs = [makeQuestion("saq-0", "open-ended")];
    const sequence = buildMixedQuestionSequence([...mcqs, ...saqs], 12);

    const { mcq, saq } = countByType(sequence);
    expect(saq).toBe(1);
    expect(mcq).toBe(11);
    // The only SAQ slot served is the first one (index 3); every later SAQ
    // slot (7, 11) falls back to MCQ instead of repeating it.
    expect(sequence[3].questionType).toBe("open-ended");
    expect(sequence[7].questionType).not.toBe("open-ended");
    expect(sequence[11].questionType).not.toBe("open-ended");
  });

  it("continues the mixed cadence from a prior batch", () => {
    const mcqs = Array.from({ length: 20 }, (_, i) => makeQuestion(`mcq-${i}`, "mcq"));
    const saqs = Array.from({ length: 20 }, (_, i) => makeQuestion(`saq-${i}`, "open-ended"));
    const firstBatch = buildMixedQuestionSequence([...mcqs, ...saqs], 10);
    const secondBatch = buildMixedQuestionSequence([...mcqs, ...saqs], 10, firstBatch);

    [...firstBatch, ...secondBatch].forEach((question, index) => {
      expect(question.questionType === "open-ended").toBe(index % 4 === 3);
    });
  });

  it("does not repeat SAQs when appending a mixed batch", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mcqs = Array.from({ length: 10 }, (_, i) => makeQuestion(`mcq-${i}`, "mcq"));
    const saqs = Array.from({ length: 10 }, (_, i) => makeQuestion(`saq-${i}`, "open-ended"));
    const bank = [...mcqs, ...saqs];

    const firstBatch = buildMixedQuestionSequence(bank, 20);
    const secondBatch = buildMixedQuestionSequence(bank, 20, firstBatch);
    const firstSaqIds = firstBatch
      .filter((question) => question.questionType === "open-ended")
      .map((question) => question.id);
    const secondSaqIds = secondBatch
      .filter((question) => question.questionType === "open-ended")
      .map((question) => question.id);

    expect(firstSaqIds).toHaveLength(5);
    expect(secondSaqIds).toHaveLength(5);
    expect(new Set([...firstSaqIds, ...secondSaqIds]).size).toBe(10);
  });

  it("treats matching SAQ ids from different question sets as distinct", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mcqs = Array.from({ length: 4 }, (_, i) => makeQuestion(`mcq-${i}`, "mcq"));
    const setAQuestion = makeQuestion("shared-saq", "open-ended", "set-a");
    const setBQuestion = makeQuestion("shared-saq", "open-ended", "set-b");
    const previousQuestions = [mcqs[0], mcqs[1], mcqs[2], setAQuestion];

    const nextBatch = buildMixedQuestionSequence(
      [...mcqs, setAQuestion, setBQuestion],
      4,
      previousQuestions,
    );

    expect(nextBatch.filter((question) => question.questionType === "open-ended"))
      .toEqual([setBQuestion]);
  });

  it("continues to deduplicate legacy SAQs by id", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mcqs = Array.from({ length: 4 }, (_, i) => makeQuestion(`mcq-${i}`, "mcq"));
    const servedLegacyQuestion = makeQuestion("served-legacy-saq", "open-ended");
    const freshLegacyQuestion = makeQuestion("fresh-legacy-saq", "open-ended");
    const previousQuestions = [mcqs[0], mcqs[1], mcqs[2], servedLegacyQuestion];

    const nextBatch = buildMixedQuestionSequence(
      [...mcqs, servedLegacyQuestion, freshLegacyQuestion],
      4,
      previousQuestions,
    );

    expect(nextBatch.filter((question) => question.questionType === "open-ended"))
      .toEqual([freshLegacyQuestion]);
  });

  it("uses the full all-SAQ bank before repeating after a partial batch", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const saqs = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(`saq-${i}`, "open-ended"),
    );
    const firstBatch = buildMixedQuestionSequence(saqs, 5);

    const secondBatch = buildMixedQuestionSequence(saqs, 10, firstBatch);

    expect(secondBatch).toHaveLength(10);
    expect(new Set(secondBatch.map((question) => question.id)).size).toBe(10);
  });

  it("reuses an exhausted SAQ-only bank when no MCQ fallback exists", () => {
    const saqs = Array.from({ length: 2 }, (_, i) => makeQuestion(`saq-${i}`, "open-ended"));
    const firstBatch = buildMixedQuestionSequence(saqs, 2);
    const secondBatch = buildMixedQuestionSequence(saqs, 2, firstBatch);

    expect(firstBatch).toHaveLength(2);
    expect(secondBatch).toHaveLength(2);
    expect(new Set(firstBatch.map((question) => question.id)).size).toBe(2);
    expect(new Set(secondBatch.map((question) => question.id)).size).toBe(2);
  });
  it("returns an empty array for a non-positive count", () => {
    expect(buildMixedQuestionSequence([makeQuestion("a", "mcq")], 0)).toEqual([]);
  });
});

describe("requiredFormatForSelection", () => {
  it("requires mcq for every slot when selection is mcq", () => {
    expect(requiredFormatForSelection("mcq", 0)).toBe("mcq");
    expect(requiredFormatForSelection("mcq", 5)).toBe("mcq");
  });

  it("requires saq for every slot when selection is open-ended", () => {
    expect(requiredFormatForSelection("open-ended", 0)).toBe("saq");
    expect(requiredFormatForSelection("open-ended", 5)).toBe("saq");
  });

  it("alternates 3 mcq then 1 saq when selection is mixed", () => {
    const expected = ["mcq", "mcq", "mcq", "saq", "mcq", "mcq", "mcq", "saq"];
    expected.forEach((format, slot) => {
      expect(requiredFormatForSelection("mixed", slot)).toBe(format);
    });
  });

  it("returns undefined when there is no selection", () => {
    expect(requiredFormatForSelection(undefined, 0)).toBeUndefined();
  });
});
