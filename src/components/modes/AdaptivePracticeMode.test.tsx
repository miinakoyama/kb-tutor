import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Question } from "@/types/question";
import { AdaptivePracticeMode } from "./AdaptivePracticeMode";

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

vi.mock("@/components/shared/NextSessionCTA", () => ({
  NextSessionCTA: () => <div>Next session</div>,
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
  id: "q-1",
  module: 1,
  topic: "Genetics",
  text: "Which option is correct?",
  imageUrl: null,
  options: [
    { id: "A", text: "Option A", feedback: "No" },
    { id: "B", text: "Option B", feedback: "Yes" },
  ],
  correctOptionId: "B",
  source: "manual",
};

describe("AdaptivePracticeMode", () => {
  beforeEach(() => {
    cleanup();
    markStageCompletedMock.mockReset();
    trackAnalyticsEventMock.mockReset();
    useAnalyticsSessionMock.mockReset();
    useAnalyticsSessionMock.mockReturnValue({
      sessionId: "session-1",
      markStageCompleted: markStageCompletedMock,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("marks self-practice complete before showing the summary", async () => {
    render(
      <AdaptivePracticeMode
        questions={[question]}
        questionCount={1}
      />,
    );

    const finishButton = await screen.findByRole("button", {
      name: "Finish Session",
    });
    fireEvent.click(finishButton);

    expect(trackAnalyticsEventMock).toHaveBeenCalledWith({
      eventType: "stage_completed",
      mode: "practice",
      assignmentId: undefined,
      sessionId: "session-1",
    });
    expect(markStageCompletedMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Session Complete" })).toBeTruthy();
    });
  });
});
