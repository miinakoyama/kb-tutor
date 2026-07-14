import { describe, expect, it } from "vitest";
import { parseQuestionPreview } from "./question-preview";

describe("parseQuestionPreview", () => {
  it("returns null for non-object input", () => {
    expect(parseQuestionPreview(null)).toBeNull();
    expect(parseQuestionPreview("not an object")).toBeNull();
  });

  it("parses an MCQ payload", () => {
    const preview = parseQuestionPreview({
      text: "What is 2 + 2?",
      options: [
        { id: "opt_1", text: "3" },
        { id: "opt_2", text: "4" },
      ],
      correctOptionId: "opt_2",
    });
    expect(preview).toEqual({
      questionType: "mcq",
      text: "What is 2 + 2?",
      imageUrl: null,
      options: [
        { id: "opt_1", text: "3" },
        { id: "opt_2", text: "4" },
      ],
      correctOptionId: "opt_2",
    });
  });

  it("returns null for an MCQ payload with no options", () => {
    expect(
      parseQuestionPreview({ text: "Stemless question", options: [] }),
    ).toBeNull();
  });

  it("parses an open-ended (short-answer) payload", () => {
    const preview = parseQuestionPreview({
      questionType: "open-ended",
      shortAnswer: {
        stem: "Explain how enzymes affect reaction rate.",
        parts: [
          { label: "A", prompt: "Define the term 'catalyst'.", maxScore: 2 },
          { label: "B", prompt: "Explain the mechanism.", maxScore: 3 },
        ],
      },
    });
    expect(preview).toEqual({
      questionType: "open-ended",
      text: "Explain how enzymes affect reaction rate.",
      imageUrl: null,
      parts: [
        { label: "A", prompt: "Define the term 'catalyst'.", maxScore: 2 },
        { label: "B", prompt: "Explain the mechanism.", maxScore: 3 },
      ],
    });
  });

  it("returns null for an open-ended payload with no stem", () => {
    expect(
      parseQuestionPreview({
        questionType: "open-ended",
        shortAnswer: { stem: "", parts: [{ label: "A", prompt: "x", maxScore: 1 }] },
      }),
    ).toBeNull();
  });

  it("returns null for an open-ended payload with no valid parts", () => {
    expect(
      parseQuestionPreview({
        questionType: "open-ended",
        shortAnswer: {
          stem: "Some stem",
          parts: [{ label: "Z", prompt: "invalid label", maxScore: 1 }],
        },
      }),
    ).toBeNull();
  });
});
