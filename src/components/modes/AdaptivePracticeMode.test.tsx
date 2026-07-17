import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptivePracticeMode } from "./AdaptivePracticeMode";
import type { Question } from "@/types/question";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";

const {
  checkForNewlyEarnedBadgesMock,
  markStageCompletedMock,
  processQueueMock,
  trackAnalyticsEventMock,
  useAnalyticsSessionMock,
} = vi.hoisted(() => ({
  checkForNewlyEarnedBadgesMock: vi.fn(),
  markStageCompletedMock: vi.fn(),
  processQueueMock: vi.fn(),
  trackAnalyticsEventMock: vi.fn(),
  useAnalyticsSessionMock: vi.fn(),
}));

vi.mock("@/lib/analytics/client", () => ({
  trackAnalyticsEvent: trackAnalyticsEventMock,
}));

vi.mock("@/lib/analytics/session", () => ({
  useAnalyticsSession: useAnalyticsSessionMock,
}));

vi.mock("@/lib/sync-queue", () => ({
  processQueue: processQueueMock,
}));

vi.mock("@/lib/badges/celebration-events", () => ({
  checkForNewlyEarnedBadges: checkForNewlyEarnedBadgesMock,
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
  getBackLabel: () => "Back",
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
    checkForNewlyEarnedBadgesMock.mockReset();
    checkForNewlyEarnedBadgesMock.mockResolvedValue(undefined);
    markStageCompletedMock.mockReset();
    processQueueMock.mockReset();
    processQueueMock.mockResolvedValue(undefined);
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
    vi.unstubAllGlobals();
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

  it.each([
    { mode: "practice" as const, summary: "Session Complete", retry: "Try Again" },
    { mode: "review" as const, summary: "Review Complete", retry: "Review Again" },
  ])("checks for newly earned badges after every repeated $mode run", async ({
    mode,
    summary,
    retry,
  }) => {
    render(
      <AdaptivePracticeMode questions={[question]} questionCount={1} mode={mode} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Finish Session" }));
    await screen.findByText(summary);
    await waitFor(() => {
      expect(checkForNewlyEarnedBadgesMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: retry }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish Session" }));

    await waitFor(() => {
      expect(checkForNewlyEarnedBadgesMock).toHaveBeenCalledTimes(2);
    });
  });

  it("loads the first adaptive question from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "selected",
          targetKcCode: "3.1.9-12.A2",
          question: { ...question, standardId: "3.1.9-12.A" },
        }),
      }),
    );
    render(
      <AdaptivePracticeMode
        questions={[]}
        questionCount={5}
        mode="practice"
        adaptiveStandardIds={["3.1.9-12.A"]}
        questionTypeSelection="mixed"
      />,
    );
    expect(await screen.findByText("Question display")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/practice/next",
      expect.objectContaining({ method: "POST" }),
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      selectionSeed: "session-1",
      selectionMode: "mixed",
      requiredFormat: "mcq",
    });
  });

  it("shows a retryable loading error instead of an empty-bank message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Unable to load mapped question candidates" }),
      }),
    );

    render(
      <AdaptivePracticeMode
        questions={[]}
        mode="practice"
        adaptiveStandardIds={["3.1.9-12.A"]}
      />,
    );

    expect(
      await screen.findByText("Unable to load practice questions. Please try again."),
    ).toBeTruthy();
    expect(screen.queryByText("No questions available for this selection yet.")).toBeNull();
  });

  it("falls back to fixed practice when the adaptive scope is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "unavailable",
        reason: "scope_unavailable",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdaptivePracticeMode
        questions={[question]}
        mode="practice"
        adaptiveStandardIds={["3.1.9-12.A"]}
      />,
    );

    expect(await screen.findByText("Question display")).toBeTruthy();
    expect(screen.queryByText("No questions available for this selection yet.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(processQueueMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Question display")).toBeTruthy();
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
