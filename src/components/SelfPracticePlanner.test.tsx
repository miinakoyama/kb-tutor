import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STANDARD_DEFINITIONS } from "@/lib/standards";
import { SelfPracticePlanner } from "./SelfPracticePlanner";

const { fetchAnswerHistoryMock } = vi.hoisted(() => ({
  fetchAnswerHistoryMock: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  fetchAnswerHistory: fetchAnswerHistoryMock,
}));

describe("SelfPracticePlanner", () => {
  beforeEach(() => {
    cleanup();
    fetchAnswerHistoryMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders mastery tags from DB-fresh answer history", async () => {
    const standard = STANDARD_DEFINITIONS[0];
    fetchAnswerHistoryMock.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        questionId: `q-${index}`,
        selectedOptionId: "A",
        isCorrect: index < 17,
        standardId: standard.id,
        timestamp: index,
        mode: "practice",
      })),
    );

    render(<SelfPracticePlanner />);

    expect(fetchAnswerHistoryMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Mastered")).toBeTruthy();
  });
});
