import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptivePracticeMode } from "./AdaptivePracticeMode";
import type { Question } from "@/types/question";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";

const {
  markStageCompletedMock,
  trackAnalyticsEventMock,
  useAnalyticsSessionMock,
} = vi.hoisted(() => ({
  markStageCompletedMock: vi.fn(),
  trackAnalyticsEventMock: vi.fn(),
  useAnalyticsSessionMock: vi.fn(),
}));

vi.mock("@/lib/analytics/client", () => ({
  trackAnalyticsEvent: trackAnalyticsEventMock,
}));

vi.mock("@/lib/analytics/session", () => ({
  useAnalyticsSession: useAnalyticsSessionMock,
}));

vi.mock("@/lib/storage", () => ({
  fetchBookmarkIds: vi.fn().mockResolvedValue([]),
  saveAnswer: vi.fn(),
  toggleBookmark: vi.fn(),
}));

vi.mock("@/lib/array-utils", () => ({
  shuffleArray: <T,>(items: T[]) => items,
}));

vi.mock("@/components/shared/PracticeHeader", () => ({
  PracticeHeader: ({ rightSlot }: { rightSlot?: ReactNode }) => (
    <header>{rightSlot}</header>
  ),
}));

vi.mock("@/components/shared/QuestionDisplay", () => ({
  QuestionDisplay: ({
    onOptionClick,
    feedbackSlot,
    belowOptionsSlot,
  }: {
    onOptionClick?: (optionId: string) => void;
    feedbackSlot?: ReactNode;
    belowOptionsSlot?: ReactNode;
  }) => (
    <div>
      <div>Question display</div>
      <button onClick={() => onOptionClick?.("B")}>Select B</button>
      {feedbackSlot}
      {belowOptionsSlot}
    </div>
  ),
}));

vi.mock("@/components/short-answer/ShortAnswerQuestionView", () => ({
  ShortAnswerQuestionView: ({
    item,
    continueLabel,
    onContinue,
    showCompletionContinue = true,
  }: {
    item: ShortAnswerItem;
    continueLabel: string;
    onContinue: () => void;
    showCompletionContinue?: boolean;
  }) => (
    <div>
      <p>{item.stem}</p>
      <p>{item.parts[0]?.prompt}</p>
      {showCompletionContinue && (
        <button onClick={onContinue}>{continueLabel}</button>
      )}
    </div>
  ),
}));

vi.mock("@/components/shared/FeedbackPanel", () => ({
  FeedbackPanel: () => null,
}));

vi.mock("@/components/shared/ConfidenceCheck", () => ({
  ConfidenceCheck: () => null,
}));

vi.mock("@/components/shared/GlossaryPopover", () => ({
  GlossaryPopover: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/shared/FeatureSpotlight", () => ({
  FeatureSpotlight: () => null,
}));

vi.mock("@/components/shared/NextSessionCTA", () => ({
  NextSessionCTA: () => null,
}));

const question: Question = {
  id: "question-1",
  module: 1,
  topic: "Genetics",
  text: "Which option is correct?",
  imageUrl: null,
  options: [
    { id: "A", text: "Option A" },
    { id: "B", text: "Option B" },
  ],
  correctOptionId: "B",
  source: "manual",
};

const shortAnswerItem = sampleShortAnswerItem as ShortAnswerItem;

describe("AdaptivePracticeMode session completion", () => {
  beforeEach(() => {
    markStageCompletedMock.mockReset();
    trackAnalyticsEventMock.mockReset();
    useAnalyticsSessionMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    useAnalyticsSessionMock.mockReturnValue({
      sessionId: "session-1",
      markStageCompleted: markStageCompletedMock,
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  });

  it("marks self-practice complete before opening the summary", async () => {
    render(
      <AdaptivePracticeMode questions={[question]} questionCount={1} mode="practice" />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Finish Session" }));

    await screen.findByText("Session Complete");
    expect(markStageCompletedMock).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(trackAnalyticsEventMock).toHaveBeenCalledWith({
        eventType: "stage_completed",
        mode: "practice",
        assignmentId: undefined,
        sessionId: "session-1",
      });
    });
  });

  it("uses all available questions when questionCount is omitted", async () => {
    render(<AdaptivePracticeMode questions={[question]} mode="practice" />);

    expect(await screen.findByText("Question display")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit" })).toBeTruthy();
    expect(screen.queryByText("No questions available for this selection yet.")).toBeNull();
  });

  it("emits explanation_opened again when a question repeats in a new cycle", async () => {
    render(
      <AdaptivePracticeMode questions={[question]} questionCount={1} mode="practice" />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(
        trackAnalyticsEventMock.mock.calls.filter(
          ([event]) => event.eventType === "explanation_opened",
        ),
      ).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(
        trackAnalyticsEventMock.mock.calls.filter(
          ([event]) => event.eventType === "explanation_opened",
        ),
      ).toHaveLength(2);
    });
  });

  it("renders a continue control when resuming a completed short-answer assignment question", async () => {
    const shortAnswerQuestion: Question = {
      ...question,
      id: "short-answer-1",
      text: shortAnswerItem.stem,
      questionType: "open-ended",
      options: [],
      correctOptionId: "",
      shortAnswer: shortAnswerItem,
    };

    render(
      <AdaptivePracticeMode
        questions={[shortAnswerQuestion]}
        questionCount={1}
        assignmentId="assignment-1"
        mode="practice"
        answered={{
          "short-answer-1": {
            selectedOptionId: "short-answer",
            isCorrect: true,
            answeredAt: "2026-07-10T10:00:00.000Z",
          },
        }}
      />,
    );

    await screen.findByText(shortAnswerItem.stem);
    fireEvent.click(screen.getByRole("button", { name: "View Results" }));

    await screen.findByText("Session Complete");
  });
});
