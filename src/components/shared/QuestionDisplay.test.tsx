import { cleanup, render, screen } from "@testing-library/react";
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

describe("QuestionDisplay option labels", () => {
  it("shows A/B/C by display position, not stored option ids", () => {
    const shuffled: Question = {
      ...question,
      options: [
        { id: "C", text: "Third stored" },
        { id: "A", text: "First stored" },
        { id: "B", text: "Second stored" },
      ],
      correctOptionId: "A",
    };

    render(
      <QuestionDisplay
        question={shuffled}
        questionNumber={1}
        onOptionClick={vi.fn()}
      />,
    );

    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.getByText("Third stored")).toBeTruthy();
    expect(screen.queryByText("D")).toBeNull();
  });
});

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
