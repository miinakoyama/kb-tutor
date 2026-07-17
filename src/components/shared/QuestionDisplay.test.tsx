import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Question } from "@/types/question";
import { QuestionDisplay } from "./QuestionDisplay";

vi.mock("@/hooks/useQuestionMedia", () => ({
  useQuestionMedia: (question: Question) => ({
    question,
    isMediaPending: false,
  }),
}));

vi.mock("@/hooks/useShortViewport", () => ({
  useShortViewport: () => true,
}));

vi.mock("@/hooks/useTextToSpeech", () => ({
  useTextToSpeech: () => ({
    isSupported: false,
    isSpeaking: false,
    currentSection: null,
    toggleSpeak: vi.fn(),
  }),
}));

const question: Question = {
  id: "q1",
  module: 1,
  topic: "Test",
  text: "Question text",
  imageUrl: null,
  options: [
    { id: "a", text: "Answer A", feedback: "" },
    { id: "b", text: "Answer B", feedback: "" },
  ],
  correctOptionId: "a",
  source: "manual",
  questionType: "mcq",
};

afterEach(cleanup);

describe("QuestionDisplay compact layout", () => {
  it("applies automatic short-viewport compaction to the card wrapper", () => {
    const { container } = render(
      <QuestionDisplay
        question={question}
        questionNumber={1}
        onOptionClick={vi.fn()}
      />,
    );

    const card = container.firstElementChild;
    expect(card?.className).toContain("rounded-2xl");
    expect(card?.className).toContain("p-4");
    expect(card?.className).not.toContain("lg:p-10");
  });

  it("honors an explicit full-size layout override", () => {
    const { container } = render(
      <QuestionDisplay
        question={question}
        questionNumber={1}
        compactLayout={false}
        onOptionClick={vi.fn()}
      />,
    );

    const card = container.firstElementChild;
    expect(card?.className).toContain("rounded-[24px]");
    expect(card?.className).toContain("lg:p-10");
  });
});
