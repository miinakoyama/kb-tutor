import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptivePracticeMode } from "./AdaptivePracticeMode";
import type { Question } from "@/types/question";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";
import * as sessionPace from "@/lib/practice/session-pace";

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
    onAllPartsResolved,
  }: {
    item: ShortAnswerItem;
    continueLabel: string;
    onContinue: () => void;
    showCompletionContinue?: boolean;
    onAllPartsResolved?: (summary: {
      correctParts: number;
      totalParts: number;
      parts: Array<{
        partLabel: "A" | "B" | "C";
        responseText: string;
        correct: boolean;
        score: number;
        maxScore: number;
        feedback: null;
        attempts: Array<{
          attemptNumber: number;
          responseText: string;
          correct: boolean;
          score: number;
          maxScore: number;
          feedback: {
            verdict: "correct" | "good_try";
            segments: Array<{ label: string; text: string }>;
          };
        }>;
      }>;
    }) => void;
  }) => (
    <div>
      <p>{item.stem}</p>
      <p>{item.parts[0]?.prompt}</p>
      <button
        type="button"
        onClick={() =>
          onAllPartsResolved?.({
            correctParts: item.parts.length,
            totalParts: item.parts.length,
            parts: item.parts.map((part) => ({
              partLabel: part.label,
              responseText: `Answer for ${part.label} (attempt 2)`,
              correct: true,
              score: part.maxScore,
              maxScore: part.maxScore,
              feedback: null,
              attempts: [
                {
                  attemptNumber: 1,
                  responseText: `Answer for ${part.label} (attempt 1)`,
                  correct: false,
                  score: 0,
                  maxScore: part.maxScore,
                  feedback: {
                    verdict: "good_try",
                    segments: [{ label: "", text: `Retry part ${part.label}.` }],
                  },
                },
                {
                  attemptNumber: 2,
                  responseText: `Answer for ${part.label} (attempt 2)`,
                  correct: true,
                  score: part.maxScore,
                  maxScore: part.maxScore,
                  feedback: {
                    verdict: "correct",
                    segments: [{ label: "", text: `Part ${part.label} looks good.` }],
                  },
                },
              ],
            })),
          })
        }
      >
        Resolve short answer
      </button>
      {showCompletionContinue && (
        <button onClick={onContinue}>{continueLabel}</button>
      )}
    </div>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              order: () => ({
                is: async () => ({ data: [], error: null }),
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
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
    expect(screen.queryByText("Question 1 of 1")).toBeNull();
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

  it("shows exam-style short-answer detail on the practice summary review", async () => {
    const shortAnswerQuestion: Question = {
      ...question,
      id: "short-answer-review-1",
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
        mode="practice"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Resolve short answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish Session" }));
    await screen.findByText("Session Complete");

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(shortAnswerItem.stem.slice(0, 40), "i"),
      }),
    );
    expect((await screen.findAllByText("Attempt 1")).length).toBeGreaterThan(0);
    expect(screen.getByText(/“Answer for A \(attempt 1\)”/)).toBeTruthy();
    expect(screen.getByText(/“Answer for A \(attempt 2\)”/)).toBeTruthy();
    expect(screen.getByText(shortAnswerItem.parts[0].prompt)).toBeTruthy();
  });

  async function completeCurrentMcqAndGoNext() {
    fireEvent.click(await screen.findByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  }

  it("offers a pace check-in after ten MCQs with continue and finish choices", async () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...question,
      id: `pace-mcq-${index}`,
    }));

    render(<AdaptivePracticeMode questions={questions} mode="practice" />);

    for (let i = 0; i < 9; i += 1) {
      await completeCurrentMcqAndGoNext();
      expect(screen.queryByText("Nice progress — take a breather?")).toBeNull();
    }

    fireEvent.click(await screen.findByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(
      await screen.findByRole("heading", {
        name: "Nice progress — take a breather?",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/You've worked through 10 questions/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue practicing" }));
    await waitFor(() => {
      expect(screen.queryByText("Nice progress — take a breather?")).toBeNull();
    });
    expect(screen.getByText("Question display")).toBeTruthy();
  });

  it("finishes the session from the pace check-in", async () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...question,
      id: `pace-finish-${index}`,
    }));

    render(<AdaptivePracticeMode questions={questions} mode="practice" />);

    for (let i = 0; i < 9; i += 1) {
      await completeCurrentMcqAndGoNext();
    }
    fireEvent.click(await screen.findByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Finish session" }),
    );
    await screen.findByText("Session Complete");
    expect(markStageCompletedMock).toHaveBeenCalled();
  });

  it("offers a pace check-in after five short-answer questions", async () => {
    const questions = Array.from({ length: 5 }, (_, index) => ({
      ...question,
      id: `pace-saq-${index}`,
      text: shortAnswerItem.stem,
      questionType: "open-ended" as const,
      options: [],
      correctOptionId: "",
      shortAnswer: shortAnswerItem,
    }));

    render(<AdaptivePracticeMode questions={questions} mode="practice" />);

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(await screen.findByRole("button", { name: "Resolve short answer" }));
      fireEvent.click(await screen.findByRole("button", { name: "Next" }));
      expect(screen.queryByText("Nice progress — take a breather?")).toBeNull();
    }

    fireEvent.click(await screen.findByRole("button", { name: "Resolve short answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(
      await screen.findByRole("heading", {
        name: "Nice progress — take a breather?",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/You've worked through 5 questions/)).toBeTruthy();
  });

  it("offers another pace check-in every ten MCQs", async () => {
    const questions = Array.from({ length: 20 }, (_, index) => ({
      ...question,
      id: `pace-repeat-${index}`,
    }));

    render(<AdaptivePracticeMode questions={questions} mode="practice" />);

    for (let i = 0; i < 9; i += 1) {
      await completeCurrentMcqAndGoNext();
    }
    fireEvent.click(await screen.findByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue practicing" }),
    );

    for (let i = 0; i < 9; i += 1) {
      await completeCurrentMcqAndGoNext();
      expect(screen.queryByText("Nice progress — take a breather?")).toBeNull();
    }
    fireEvent.click(await screen.findByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(
      await screen.findByRole("heading", {
        name: "Nice progress — take a breather?",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/You've worked through 20 questions/)).toBeTruthy();
  });

  it("offers a pace check-in during open-ended review sessions", async () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...question,
      id: `pace-review-${index}`,
    }));

    render(<AdaptivePracticeMode questions={questions} mode="review" />);

    for (let i = 0; i < 9; i += 1) {
      await completeCurrentMcqAndGoNext();
    }
    fireEvent.click(await screen.findByRole("button", { name: "Select B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(
      await screen.findByRole("heading", {
        name: "Nice progress — take a breather?",
      }),
    ).toBeTruthy();
  });

  it("skips the pace check-in when the adaptive question limit is reached", async () => {
    // Force a check-in whenever the gate is enabled, so this test isolates the
    // adaptive questionCount terminal guard rather than the pace threshold.
    const paceSpy = vi
      .spyOn(sessionPace, "shouldOfferPracticePaceCheckIn")
      .mockImplementation((options) => options.enabled);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "selected",
        targetKcCode: "3.1.9-12.A2",
        question: {
          ...question,
          id: "adaptive-limit-1",
          standardId: "3.1.9-12.A",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <AdaptivePracticeMode
          questions={[]}
          questionCount={1}
          mode="practice"
          adaptiveStandardIds={["3.1.9-12.A"]}
        />,
      );

      fireEvent.click(await screen.findByRole("button", { name: "Select B" }));
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      fireEvent.click(await screen.findByRole("button", { name: "Next" }));

      expect(screen.queryByText("Nice progress — take a breather?")).toBeNull();
      await screen.findByText("Session Complete");
      expect(paceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    } finally {
      paceSpy.mockRestore();
    }
  });
});
