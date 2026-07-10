import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("starts on the mode selection step with Next disabled until a mode is chosen", async () => {
    fetchAnswerHistoryMock.mockResolvedValue([]);

    render(<SelfPracticePlanner />);

    const nextButton = await screen.findByRole("button", { name: "Next" });

    expect(screen.getByText("Select Mode")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Practice Get feedback as you go\./,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Exam No hints\. Just like test day\./,
      }),
    ).toBeTruthy();
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Practice Get feedback as you go\./,
      }),
    );

    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("renders mastery from the asynchronous answer history after advancing to topics", async () => {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: /Practice Get feedback as you go\./,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Choose Topics")).toBeTruthy();
    expect(await screen.findByText("Mastered")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Start Practice" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
