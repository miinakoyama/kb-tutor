import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Question } from "@/types/question";
import { PracticePageClient } from "./PracticePageClient";

const state = vi.hoisted(() => ({
  visibleQuestions: [] as Question[],
}));

vi.mock("@/hooks/useQuestions", () => ({
  useQuestions: () => ({
    visibleQuestions: state.visibleQuestions,
    isLoaded: true,
    role: "student",
  }),
}));

vi.mock("@/components/modes/AdaptivePracticeMode", () => ({
  AdaptivePracticeMode: ({
    questions,
    adaptiveStandardIds,
  }: {
    questions: Question[];
    adaptiveStandardIds?: string[];
  }) => (
    <div
      data-testid="practice-mode"
      data-question-ids={questions.map((question) => question.id).join(",")}
      data-adaptive-standards={adaptiveStandardIds?.join(",") ?? ""}
    />
  ),
}));

vi.mock("@/components/modes/ExamMode", () => ({ ExamMode: () => null }));
vi.mock("@/components/modes/ReviewMode", () => ({ ReviewMode: () => null }));
vi.mock("@/lib/all-assignments-complete-modal", () => ({
  emitAllAssignmentsCompletedEvent: vi.fn(),
}));

const question = (id: string, standardId: string): Question => ({
  id,
  module: 1,
  topic: "Genetics",
  standardId,
  text: `Question ${id}`,
  imageUrl: null,
  options: [
    { id: "A", text: "Option A" },
    { id: "B", text: "Option B" },
  ],
  correctOptionId: "A",
  source: "manual",
});

describe("PracticePageClient adaptive scope", () => {
  beforeEach(() => {
    state.visibleQuestions = [
      question("question-a", "3.1.9-12.A"),
      question("question-b", "3.1.9-12.B"),
    ];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("preserves an explicit question-id scope as fixed practice", () => {
    render(
      <PracticePageClient
        modeParam="practice"
        questionIdsParam="question-a"
      />,
    );

    const mode = screen.getByTestId("practice-mode");
    expect(mode.getAttribute("data-question-ids")).toBe("question-a");
    expect(mode.getAttribute("data-adaptive-standards")).toBe("");
  });

  it("enables adaptive selection for ordinary self-practice scope", () => {
    render(<PracticePageClient modeParam="practice" />);

    expect(
      screen.getByTestId("practice-mode").getAttribute("data-adaptive-standards"),
    ).toBe("3.1.9-12.A,3.1.9-12.B");
  });

  it("blocks an unavailable assignment instead of falling back to Self Practice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error:
              "This assignment contains unavailable questions. Ask your teacher to check the assignment setup.",
            code: "assignment_questions_unavailable",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(
      <PracticePageClient
        modeParam="practice"
        assignmentIdParam="assignment-1"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("practice-mode")).toBeNull();
      expect(
        screen.getByText(/This assignment contains unavailable questions/),
      ).toBeTruthy();
    });
    expect(screen.getByText("Back to Assignments")).toBeTruthy();
  });

  it("keeps a successful empty assignment response isolated from Self Practice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ questions: [], answered: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(
      <PracticePageClient
        modeParam="practice"
        assignmentIdParam="assignment-1"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("practice-mode").getAttribute("data-question-ids"),
      ).toBe("");
    });
  });
});
