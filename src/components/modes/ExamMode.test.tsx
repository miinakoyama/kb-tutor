import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamMode } from "./ExamMode";
import type { Question } from "@/types/question";

const EXAM_ONBOARDING_DISMISSED_KEY = "kb-tutor-exam-onboarding-dismissed-v1";

const {
  trackAnalyticsEventMock,
  useAnalyticsSessionMock,
} = vi.hoisted(() => ({
  trackAnalyticsEventMock: vi.fn(),
  useAnalyticsSessionMock: vi.fn(),
}));

vi.mock("@/lib/analytics/client", () => ({
  trackAnalyticsEvent: trackAnalyticsEventMock,
}));

vi.mock("@/lib/analytics/session", () => ({
  useAnalyticsSession: useAnalyticsSessionMock,
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

describe("ExamMode onboarding timing + analytics gating", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    trackAnalyticsEventMock.mockReset();
    useAnalyticsSessionMock.mockReset();
    useAnalyticsSessionMock.mockReturnValue({
      sessionId: null,
      markStageCompleted: vi.fn(),
    });

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
});

