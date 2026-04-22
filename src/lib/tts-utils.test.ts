import { describe, expect, it } from "vitest";
import {
  buildChoicesReadText,
  buildFeedbackReadText,
} from "@/lib/tts-utils";
import type { AnswerRecord, Question } from "@/types/question";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    module: 1,
    topic: "Genetics",
    text: "Q",
    imageUrl: null,
    options: [
      { id: "A", text: "Alpha", feedback: "Correct. Great job." },
      { id: "B", text: "Beta", feedback: "Incorrect. Try again." },
    ],
    correctOptionId: "A",
    source: "manual",
    ...overrides,
  };
}

describe("buildChoicesReadText", () => {
  it("joins options in the form 'ID. TEXT' separated by spaces", () => {
    expect(buildChoicesReadText(makeQuestion())).toBe(
      "A. Alpha B. Beta",
    );
  });
});

describe("buildFeedbackReadText", () => {
  it("returns an empty string when no answer is supplied", () => {
    expect(buildFeedbackReadText(makeQuestion())).toBe("");
  });

  it("announces 'Correct.' when the student answered correctly", () => {
    const answer: AnswerRecord = {
      selectedOptionId: "A",
      isCorrect: true,
    };
    const text = buildFeedbackReadText(makeQuestion(), answer);
    expect(text.startsWith("Correct.")).toBe(true);
    // Strips the 'Correct.' prefix from the option feedback itself to avoid
    // double-announcements.
    expect(text).toBe("Correct. Great job.");
  });

  it("announces 'Incorrect.' and strips the leading 'Incorrect.' from the feedback", () => {
    const answer: AnswerRecord = {
      selectedOptionId: "B",
      isCorrect: false,
    };
    expect(buildFeedbackReadText(makeQuestion(), answer)).toBe(
      "Incorrect. Try again.",
    );
  });

  it("optionally appends the key knowledge when requested", () => {
    const answer: AnswerRecord = {
      selectedOptionId: "A",
      isCorrect: true,
    };
    const text = buildFeedbackReadText(
      makeQuestion({ keyKnowledge: "Focus on DNA base pairing." }),
      answer,
      { includeKeyKnowledge: true },
    );
    expect(text).toContain("Key idea. Focus on DNA base pairing.");
  });

  it("only appends the misconception when the answer was wrong", () => {
    const correct = buildFeedbackReadText(
      makeQuestion({ commonMisconception: "Common trap" }),
      { selectedOptionId: "A", isCorrect: true },
      { includeMisconception: true },
    );
    expect(correct).not.toContain("Common misconception");

    const wrong = buildFeedbackReadText(
      makeQuestion({ commonMisconception: "Common trap" }),
      { selectedOptionId: "B", isCorrect: false },
      { includeMisconception: true },
    );
    expect(wrong).toContain("Common misconception. Common trap");
  });

  it("falls back to the correct option's feedback when the selected option cannot be found", () => {
    const answer: AnswerRecord = {
      selectedOptionId: "does-not-exist",
      isCorrect: false,
    };
    const text = buildFeedbackReadText(makeQuestion(), answer);
    // isCorrect explicitly false so we still announce Incorrect., then
    // fall back to the correct option's feedback (Option A, which starts
    // with "Correct. Great job.").
    expect(text).toContain("Incorrect.");
    expect(text).toContain("Great job.");
  });
});
