import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StandardDrillDownTable } from "./StandardDrillDownTable";
import type {
  StandardDrillDownPayload,
} from "@/lib/analytics/teacher-analytics-types";

const { routerPushMock, searchParamsMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => searchParamsMock(),
  usePathname: () => "/teacher-dashboard/standards/3.1.9-12.A",
}));

vi.mock("@/components/shared/LatexText", () => ({
  LatexText: ({ text }: { text: string }) => <span>{text}</span>,
}));

afterEach(() => {
  cleanup();
  routerPushMock.mockReset();
  searchParamsMock.mockImplementation(() => new URLSearchParams());
});

function makePayload(): StandardDrillDownPayload {
  return {
    standardId: "3.1.9-12.A",
    standardLabel: "Construct an explanation …",
    summary: {
      totalAttempts: 5,
      totalCorrect: 3,
      accuracy: 0.6,
      uniqueStudents: 3,
      questionsAttempted: 2,
    },
    questions: [
      {
        questionId: "q_low",
        preview: {
          text: "Hard question",
          imageUrl: null,
          diagram: null,
          options: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
          ],
          correctOptionId: "b",
        },
        attempted: 5,
        uniqueStudents: 5,
        correct: 1,
        accuracy: 0.2,
        bucket: "low",
        averageTimeSec: 35,
        byMode: {
          practice: { attempted: 3, correct: 1, accuracy: 1 / 3, averageTimeSec: 30 },
          exam: { attempted: 2, correct: 0, accuracy: 0, averageTimeSec: 40 },
          review: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
        },
        optionDistribution: [
          { optionId: "a", text: "A", isCorrect: false, picks: 4, share: 0.8 },
          { optionId: "b", text: "B", isCorrect: true, picks: 1, share: 0.2 },
        ],
      },
      {
        questionId: "q_high",
        preview: {
          text: "Easy question",
          imageUrl: null,
          diagram: null,
          options: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
          ],
          correctOptionId: "a",
        },
        attempted: 5,
        uniqueStudents: 5,
        correct: 4,
        accuracy: 0.8,
        bucket: "high",
        averageTimeSec: 22,
        byMode: {
          practice: { attempted: 5, correct: 4, accuracy: 0.8, averageTimeSec: 22 },
          exam: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
          review: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
        },
        optionDistribution: [
          { optionId: "a", text: "A", isCorrect: true, picks: 4, share: 0.8 },
          { optionId: "b", text: "B", isCorrect: false, picks: 1, share: 0.2 },
        ],
      },
    ],
  };
}

describe("StandardDrillDownTable", () => {
  it("renders one row per question with attempted, correct, and accuracy", () => {
    render(<StandardDrillDownTable payload={makePayload()} />);
    expect(screen.getByText("Hard question")).toBeDefined();
    expect(screen.getByText("Easy question")).toBeDefined();
    expect(screen.getAllByText("20%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("80%").length).toBeGreaterThan(0);
  });

  it("renders the bucket label on accuracy bars (a11y)", () => {
    const { container } = render(
      <StandardDrillDownTable payload={makePayload()} />,
    );
    expect(container.textContent).toMatch(/Mostly wrong/);
    expect(container.textContent).toMatch(/Mostly right/);
  });

  it("expanding a row reveals the option distribution", () => {
    render(<StandardDrillDownTable payload={makePayload()} />);
    const expandButtons = screen.getAllByLabelText(/Expand question/);
    fireEvent.click(expandButtons[0]);
    expect(
      screen.getByTestId("question-expanded-q_low"),
    ).toBeDefined();
    // First option's share appears twice in the expanded view (badge + bar tooltip).
    const hits = screen.getAllByText(/4 \(80%\)/);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("clicking the question link routes to ?question=<id>", () => {
    render(<StandardDrillDownTable payload={makePayload()} />);
    const link = screen.getByTestId(
      "question-detail-link-q_low",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("question=q_low");
  });

  it("shows an empty state when there are no rows", () => {
    const payload = makePayload();
    payload.questions = [];
    payload.summary.questionsAttempted = 0;
    payload.summary.totalAttempts = 0;
    render(<StandardDrillDownTable payload={payload} />);
    expect(
      screen.getByText(/No attempts on this standard yet/i),
    ).toBeDefined();
  });
});
