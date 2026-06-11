import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptivePracticeMode } from "./AdaptivePracticeMode";
import type { Question } from "@/types/question";

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
  QuestionDisplay: () => <div>Question display</div>,
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

describe("AdaptivePracticeMode session completion", () => {
  beforeEach(() => {
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
});
