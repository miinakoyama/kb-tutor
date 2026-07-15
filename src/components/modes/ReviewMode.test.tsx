import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewMode } from "./ReviewMode";
import type { Question } from "@/types/question";

const { fetchIncorrectQuestionCounts } = vi.hoisted(() => ({
  fetchIncorrectQuestionCounts: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({ fetchIncorrectQuestionCounts }));
vi.mock("@/lib/array-utils", () => ({ shuffleArray: <T,>(items: T[]) => items }));
vi.mock("@/components/modes/AdaptivePracticeMode", () => ({
  AdaptivePracticeMode: (props: {
    mode: string;
    adaptiveStandardIds?: string[];
    questions: Question[];
  }) => (
    <div data-testid="review-run">
      {props.mode}:{String(Boolean(props.adaptiveStandardIds))}:
      {props.questions.map((item) => item.questionSetId ?? "legacy").join(",")}
    </div>
  ),
}));

const question: Question = {
  id: "q1", module: 1, topic: "Genetics", text: "Question", imageUrl: null,
  options: [{ id: "A", text: "A" }], correctOptionId: "A", source: "generated",
};

describe("ReviewMode", () => {
  beforeEach(() => fetchIncorrectQuestionCounts.mockReset());

  it("renders an English empty state when no mistakes are due", async () => {
    fetchIncorrectQuestionCounts.mockResolvedValue({});
    render(<ReviewMode questions={[question]} />);
    expect(await screen.findByText("Nothing to Review!")).not.toBeNull();
  });

  it("keeps existing mistake selection and never enables adaptive selection", async () => {
    fetchIncorrectQuestionCounts.mockResolvedValue({ "question:q1": 2 });
    render(<ReviewMode questions={[question]} />);
    await waitFor(() => expect(screen.getByTestId("review-run").textContent).toBe("review:false:legacy"));
  });

  it("matches review history by question set when ids collide", async () => {
    fetchIncorrectQuestionCounts.mockResolvedValue({
      "set-question:set-a\0q1": 1,
    });
    render(
      <ReviewMode
        questions={[
          { ...question, questionSetId: "set-a" },
          { ...question, questionSetId: "set-b" },
        ]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("review-run").textContent).toBe(
        "review:false:set-a",
      ),
    );
  });

  it("does not apply ambiguous legacy history to duplicate ids", async () => {
    fetchIncorrectQuestionCounts.mockResolvedValue({ "question:q1": 1 });
    render(
      <ReviewMode
        questions={[
          { ...question, questionSetId: "set-a" },
          { ...question, questionSetId: "set-b" },
        ]}
      />,
    );

    expect(await screen.findByText("Nothing to Review!")).not.toBeNull();
  });
});
