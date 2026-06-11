import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelfPracticePlanner } from "./SelfPracticePlanner";
import type { StoredAnswer } from "@/lib/storage";

const { fetchAnswerHistoryMock } = vi.hoisted(() => ({
  fetchAnswerHistoryMock: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  fetchAnswerHistory: fetchAnswerHistoryMock,
}));

describe("SelfPracticePlanner mastery statistics", () => {
  beforeEach(() => {
    fetchAnswerHistoryMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders mastery from the asynchronous answer history", async () => {
    const history: StoredAnswer[] = Array.from({ length: 20 }, (_, index) => ({
      questionId: `question-${index}`,
      selectedOptionId: "A",
      isCorrect: index < 18,
      standardId: "3.1.9-12.A",
      timestamp: index,
      mode: "practice",
    }));
    fetchAnswerHistoryMock.mockResolvedValue(history);

    render(<SelfPracticePlanner />);

    expect(fetchAnswerHistoryMock).toHaveBeenCalledOnce();
    expect(await screen.findByText("Mastered")).toBeTruthy();
  });
});
