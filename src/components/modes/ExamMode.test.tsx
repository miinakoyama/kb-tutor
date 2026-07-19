import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamMode } from "./ExamMode";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import type { Question } from "@/types/question";
import type { ShortAnswerItem } from "@/types/short-answer";
import { getAnswerHistory } from "@/lib/storage";

const EXAM_ONBOARDING_DISMISSED_KEY = "kb-tutor-exam-onboarding-dismissed-v1";

const {
  checkForNewlyEarnedBadgesMock,
  trackAnalyticsEventMock,
  useAnalyticsSessionMock,
  useQuestionMediaMock,
} = vi.hoisted(() => ({
  checkForNewlyEarnedBadgesMock: vi.fn(),
  trackAnalyticsEventMock: vi.fn(),
  useAnalyticsSessionMock: vi.fn(),
  useQuestionMediaMock: vi.fn(),
}));

vi.mock("@/lib/analytics/client", () => ({
  trackAnalyticsEvent: trackAnalyticsEventMock,
}));

vi.mock("@/lib/analytics/session", () => ({
  useAnalyticsSession: useAnalyticsSessionMock,
}));

vi.mock("@/lib/badges/celebration-events", () => ({
  checkForNewlyEarnedBadges: checkForNewlyEarnedBadgesMock,
}));

vi.mock("@/hooks/useQuestionMedia", () => ({
  useQuestionMedia: useQuestionMediaMock,
}));

vi.mock("@/hooks/useTextToSpeech", () => ({
  useTextToSpeech: () => ({
    isSupported: false,
    isSpeaking: false,
    currentSection: null,
    toggleSpeak: vi.fn(),
  }),
}));

vi.mock("@/components/shared/Timer", () => ({
  Timer: ({ isRunning }: { isRunning: boolean }) => (
    <div data-testid="timer-running">{String(isRunning)}</div>
  ),
}));

vi.mock("@/components/shared/NextSessionCTA", () => ({
  NextSessionCTA: () => <div data-testid="next-session-cta" />,
}));

function getTrackedEventTypes(): string[] {
  return trackAnalyticsEventMock.mock.calls
    .map((call) => call[0])
    .map((payload): string | null => {
      if (typeof payload !== "object" || payload === null) return null;
      if (!("eventType" in payload)) return null;
      const eventType = (payload as { eventType: unknown }).eventType;
      return typeof eventType === "string" ? eventType : null;
    })
    .filter((eventType): eventType is string => eventType !== null);
}

const baseQuestion: Question = {
  id: "q-1",
  module: 1,
  topic: "Genetics",
  text: "Which option is correct?",
  imageUrl: null,
  options: [
    { id: "A", text: "Option A", feedback: "No" },
    { id: "B", text: "Option B", feedback: "Yes" },
    { id: "C", text: "Option C", feedback: "No" },
    { id: "D", text: "Option D", feedback: "No" },
  ],
  correctOptionId: "B",
  source: "manual",
};
const shortAnswerItem = sampleShortAnswerItem as ShortAnswerItem;

function makeQuestion(id: string, text: string, correctOptionId = "B"): Question {
  return {
    ...baseQuestion,
    id,
    text,
    correctOptionId,
  };
}

describe("ExamMode onboarding timing + analytics gating", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    checkForNewlyEarnedBadgesMock.mockReset();
    checkForNewlyEarnedBadgesMock.mockResolvedValue(undefined);
    trackAnalyticsEventMock.mockReset();
    useAnalyticsSessionMock.mockReset();
    useAnalyticsSessionMock.mockReturnValue({
      sessionId: null,
      markStageCompleted: vi.fn(),
    });
    useQuestionMediaMock.mockImplementation((question: Question | null | undefined) => ({
      question,
      isMediaPending: false,
    }));

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps timer stopped and suppresses question_viewed while onboarding is visible", async () => {
    render(<ExamMode questions={[baseQuestion]} requestedQuestionCount={1} />);

    await screen.findByText("How this session works");

    expect(screen.getByTestId("timer-running").textContent).toBe("false");
    expect(getTrackedEventTypes()).not.toContain("question_viewed");
  });

  it("runs timer and emits question_viewed once onboarding is already dismissed", async () => {
    localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    render(<ExamMode questions={[baseQuestion]} requestedQuestionCount={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("timer-running").textContent).toBe("true");
    });

    await waitFor(() => {
      expect(getTrackedEventTypes()).toContain("question_viewed");
    });
  });

  it("dismisses onboarding and enables the exam when localStorage.setItem throws", async () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage quota");
    });
    try {
      render(<ExamMode questions={[baseQuestion]} requestedQuestionCount={1} />);

      await screen.findByText("How this session works");
      fireEvent.click(screen.getByRole("button", { name: "Skip tips" }));

      await waitFor(() => {
        expect(screen.queryByText("How this session works")).toBeNull();
      });
      await waitFor(() => {
        expect(screen.getByTestId("timer-running").textContent).toBe("true");
      });
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("counts unanswered submitted exam questions as incorrect and keeps them reviewable", async () => {
    localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ all_assignments_completed: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExamMode
        questions={[
          makeQuestion("q-1", "Question one prompt"),
          makeQuestion("q-2", "Question two prompt"),
        ]}
        requestedQuestionCount={2}
        assignmentId="assignment-1"
        answered={{}}
      />,
    );

    await screen.findByText("Question one prompt");
    fireEvent.click(screen.getByRole("button", { name: /B\s*Option B/i }));
    expect(getAnswerHistory()).toContainEqual(
      expect.objectContaining({
        questionId: "q-1",
        mode: "exam",
        isFinalized: false,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByText("Submit Exam?");
    expect(screen.getByText("You have 1 unanswered question.")).toBeTruthy();
    const submitButtons = screen.getAllByRole("button", { name: "Submit" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await screen.findByText("Exam Complete!");
    expect(getAnswerHistory()).toContainEqual(
      expect.objectContaining({
        questionId: "q-1",
        mode: "exam",
        isFinalized: true,
      }),
    );
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("Correct").previousElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Incorrect").previousElementSibling?.textContent).toBe("1");
    expect(screen.getAllByText("Unanswered")[0].previousElementSibling?.textContent).toBe("1");
    expect(screen.getAllByText("Unanswered")).toHaveLength(1);
    expect(screen.getByText("Question one prompt")).toBeTruthy();
    expect(screen.getByText("Question two prompt")).toBeTruthy();

    const unansweredReviewButton = screen.getByText("Question two prompt").closest("button");
    expect(unansweredReviewButton).not.toBeNull();
    fireEvent.click(unansweredReviewButton!);

    await screen.findByText("No answer submitted");
    expect(
      screen.getByText(
        "This question was left unanswered. It is counted as incorrect, and the correct option is highlighted above for review.",
      ),
    ).toBeTruthy();
  });

  it("uses graded short-answer correctness in the results list", async () => {
    localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/short-answer/grade")) {
        return new Response(
          JSON.stringify({
            score: 1,
            maxScore: 1,
            correct: true,
            feedback: { verdict: "correct", segments: [] },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ all_assignments_completed: false }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const question: Question = {
      ...baseQuestion,
      id: shortAnswerItem.stem,
      text: shortAnswerItem.stem,
      questionType: "open-ended",
      options: [],
      correctOptionId: "",
      shortAnswer: {
        ...shortAnswerItem,
        parts: [shortAnswerItem.parts[0]],
      },
    };

    render(<ExamMode questions={[question]} requestedQuestionCount={1} />);

    await screen.findByText(shortAnswerItem.stem);
    expect(screen.getByRole("button", { name: /previous/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /bookmark/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /mark for review/i })).toBeTruthy();
    // Single-question exam: the current question is also the last one, so the
    // bottom action bar shows Submit (disabled until answered) instead of Next.
    const bottomSubmitBeforeAnswer = screen.getAllByRole("button", { name: "Submit" }).at(-1)!;
    expect((bottomSubmitBeforeAnswer as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Answer for Part A"), {
      target: { value: "mRNA carries the code to the ribosome." },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" }).at(-1)!);

    await screen.findByText("Exam Complete!");
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("Correct").previousElementSibling?.textContent).toBe("1");
    expect(
      screen.getByText(shortAnswerItem.stem).closest("button")?.className,
    ).toContain("border-primary/20");

    fireEvent.click(screen.getByText(shortAnswerItem.stem).closest("button")!);
    await screen.findByText("Sample answer");
    expect(screen.getByText(/mRNA carries the genetic code/i)).toBeTruthy();
  });

  it("shows a saved model-answer-only result in exam review", async () => {
    localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/short-answer/grade")) {
          return new Response(
            JSON.stringify({
              score: 0,
              maxScore: 1,
              correct: false,
              feedback: {
                verdict: "heres_the_idea",
                segments: [],
                modelAnswer: "Stored canonical answer from the final attempt.",
              },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ all_assignments_completed: false }),
          { status: 200 },
        );
      }),
    );

    const question: Question = {
      ...baseQuestion,
      id: `${shortAnswerItem.stem}-model-answer-review`,
      text: shortAnswerItem.stem,
      questionType: "open-ended",
      options: [],
      correctOptionId: "",
      shortAnswer: {
        ...shortAnswerItem,
        parts: [shortAnswerItem.parts[0]],
      },
    };

    render(<ExamMode questions={[question]} requestedQuestionCount={1} />);

    await screen.findByText(shortAnswerItem.stem);
    fireEvent.change(screen.getByLabelText("Answer for Part A"), {
      target: { value: "DNA" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" }).at(-1)!);

    await screen.findByText("Exam Complete!");
    fireEvent.click(screen.getByText(shortAnswerItem.stem).closest("button")!);
    expect(await screen.findByText("Model answer")).toBeTruthy();
    expect(
      screen.getByText("Stored canonical answer from the final attempt."),
    ).toBeTruthy();
  });

  it("disables short-answer entry and submission while stimulus media is loading", async () => {
    localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    useQuestionMediaMock.mockImplementation((question: Question | null | undefined) => ({
      question,
      isMediaPending: question?.id === "saq-media-pending",
    }));
    const question: Question = {
      ...baseQuestion,
      id: "saq-media-pending",
      text: shortAnswerItem.stem,
      questionType: "open-ended",
      options: [],
      correctOptionId: "",
      shortAnswer: {
        ...shortAnswerItem,
        parts: [shortAnswerItem.parts[0]],
      },
    };

    render(<ExamMode questions={[question]} requestedQuestionCount={1} />);

    const answer = await screen.findByLabelText("Answer for Part A");
    // Single-question exam: header Submit and the bottom-bar Submit (last question) both render.
    const submitButtons = screen.getAllByRole("button", { name: "Submit" });
    expect((answer as HTMLTextAreaElement).disabled).toBe(true);
    for (const submit of submitButtons) {
      expect((submit as HTMLButtonElement).disabled).toBe(true);
    }

    fireEvent.click(submitButtons[0]);
    expect(screen.queryByText("Submit Exam?")).toBeNull();
  });

  it("clears short-answer responses when retrying an exam", async () => {
    localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/short-answer/grade")) {
          return new Response(
            JSON.stringify({
              score: 0,
              maxScore: 1,
              correct: false,
              feedback: { verdict: "incorrect", segments: [] },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ all_assignments_completed: false }),
          { status: 200 },
        );
      }),
    );

    const question: Question = {
      ...baseQuestion,
      id: `${shortAnswerItem.stem}-retry`,
      text: shortAnswerItem.stem,
      questionType: "open-ended",
      options: [],
      correctOptionId: "",
      shortAnswer: {
        ...shortAnswerItem,
        parts: [shortAnswerItem.parts[0]],
      },
    };

    render(<ExamMode questions={[question]} requestedQuestionCount={1} />);

    await screen.findByText(shortAnswerItem.stem);
    fireEvent.change(screen.getByLabelText("Answer for Part A"), {
      target: { value: "This answer should be cleared." },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" }).at(-1)!);

    await screen.findByText("Exam Complete!");
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

    await screen.findByText(shortAnswerItem.stem);
    const retriedAnswer = screen.getByLabelText("Answer for Part A");
    expect(retriedAnswer).toBeInstanceOf(HTMLTextAreaElement);
    expect((retriedAnswer as HTMLTextAreaElement).value).toBe("");
  });

  it("checks for newly earned badges after every exam retry", async () => {
    localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    render(<ExamMode questions={[baseQuestion]} requestedQuestionCount={1} />);

    await screen.findByText(baseQuestion.text);
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    await screen.findByText("Submit Exam?");
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" }).at(-1)!);
    await screen.findByText("Exam Complete!");
    await waitFor(() => {
      expect(checkForNewlyEarnedBadgesMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await screen.findByText(baseQuestion.text);
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    await screen.findByText("Submit Exam?");
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" }).at(-1)!);

    await waitFor(() => {
      expect(checkForNewlyEarnedBadgesMock).toHaveBeenCalledTimes(2);
    });
  });

  it("does not send blank short-answer parts for exam grading", async () => {
    localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    const gradeBodies: Array<{
      partLabel?: unknown;
      studentResponse?: unknown;
    }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/short-answer/grade")) {
        gradeBodies.push(
          JSON.parse(String(init?.body)) as {
            partLabel?: unknown;
            studentResponse?: unknown;
          },
        );
        return new Response(
          JSON.stringify({
            score: 1,
            maxScore: 1,
            correct: true,
            feedback: { verdict: "correct", segments: [] },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ all_assignments_completed: false }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const question: Question = {
      ...baseQuestion,
      id: `${shortAnswerItem.stem}-blank-part`,
      text: shortAnswerItem.stem,
      questionType: "open-ended",
      options: [],
      correctOptionId: "",
      shortAnswer: {
        ...shortAnswerItem,
        parts: shortAnswerItem.parts.slice(0, 2),
      },
    };

    render(<ExamMode questions={[question]} requestedQuestionCount={1} />);

    await screen.findByText(shortAnswerItem.stem);
    fireEvent.change(screen.getByLabelText("Answer for Part A"), {
      target: { value: "mRNA carries the code to the ribosome." },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" }).at(-1)!);

    await screen.findByText("Exam Complete!");
    const gradeCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/short-answer/grade"),
    );
    expect(gradeCalls).toHaveLength(1);
    const body = gradeBodies[0];
    expect(body.partLabel).toBe("A");
    expect(body.studentResponse).toBe("mRNA carries the code to the ribosome.");
    expect(typeof (body as { practiceRunAfter?: unknown }).practiceRunAfter).toBe(
      "string",
    );
    expect(screen.getByText("0%")).toBeTruthy();
  });
});
