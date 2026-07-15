import { describe, expect, it } from "vitest";
import { buildMixedQuestionSequence, requiredFormatForSelection } from "./question-type-sequence";
import type { Question } from "@/types/question";

function makeQuestion(id: string, questionType: "mcq" | "open-ended"): Question {
  return {
    id,
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
