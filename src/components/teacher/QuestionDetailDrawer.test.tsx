import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionDetailDrawer } from "./QuestionDetailDrawer";
import type { QuestionDetailPayload } from "@/lib/analytics/teacher-analytics-types";

const { routerPushMock, searchParamsRef } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  searchParamsRef: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => searchParamsRef.current,
  usePathname: () => "/teacher-dashboard/standards/3.1.9-12.A",
}));

vi.mock("@/components/shared/LatexText", () => ({
  LatexText: ({ text }: { text: string }) => <span>{text}</span>,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  searchParamsRef.current = new URLSearchParams();
  routerPushMock.mockReset();
  fetchMock.mockReset();
});

afterEach(() => cleanup());

function makePayload(
  overrides: Partial<QuestionDetailPayload> = {},
): QuestionDetailPayload {
  return {
    questionId: "q1",
    preview: {
      text: "Q1 stem",
      imageUrl: null,
      diagram: null,
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      correctOptionId: "b",
    },
    standardId: "3.1.9-12.A",
    standardLabel: "Standard A",
    scope: "selected",
    summary: {
      totalAttempts: 4,
      uniqueStudents: 3,
      correct: 2,
      accuracy: 0.5,
      averageTimeSec: 35,
      timeP50Sec: 30,
      timeP90Sec: 60,
    },
    byMode: {
      practice: { attempted: 3, correct: 2, accuracy: 2 / 3, averageTimeSec: 30 },
      exam: { attempted: 1, correct: 0, accuracy: 0, averageTimeSec: 50 },
      review: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
    },
    optionDistribution: [
      { optionId: "a", text: "A", isCorrect: false, picks: 2, share: 0.5 },
      { optionId: "b", text: "B", isCorrect: true, picks: 2, share: 0.5 },
    ],
    ...overrides,
  };
}

describe("QuestionDetailDrawer", () => {
  it("renders nothing when ?question is absent", () => {
    const { container } = render(<QuestionDetailDrawer role="teacher" />);
    expect(container.firstChild).toBeNull();
  });

  it("opens and renders the payload when ?question is set", async () => {
    searchParamsRef.current = new URLSearchParams({ question: "q1" });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makePayload()), { status: 200 }),
    );
    render(<QuestionDetailDrawer role="teacher" />);
    await waitFor(() => {
      expect(screen.getByText("Q1 stem")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("question-detail-drawer")).toBeDefined();
  });

  it("renders the empty state when the API returns zero attempts", async () => {
    searchParamsRef.current = new URLSearchParams({ question: "q1" });
    const empty = makePayload({
      summary: {
        totalAttempts: 0,
        uniqueStudents: 0,
        correct: 0,
        accuracy: 0,
        averageTimeSec: 0,
        timeP50Sec: null,
        timeP90Sec: null,
      },
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(empty), { status: 200 }),
    );
    render(<QuestionDetailDrawer role="teacher" />);
    await waitFor(() => {
      expect(
        screen.getByText(/No students have attempted this question yet/i),
      ).toBeDefined();
    });
  });

  it("shows the scope toggle for admin role but not for teacher", async () => {
    searchParamsRef.current = new URLSearchParams({ question: "q1" });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makePayload()), { status: 200 }),
    );
    const { rerender } = render(<QuestionDetailDrawer role="teacher" />);
    await waitFor(() => screen.getByText("Q1 stem"));
    expect(screen.queryByText(/Selected schools/i)).toBeNull();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makePayload()), { status: 200 }),
    );
    rerender(<QuestionDetailDrawer role="admin" />);
    await waitFor(() => {
      expect(screen.getByText(/Selected schools/i)).toBeDefined();
      expect(screen.getByText(/All schools/i)).toBeDefined();
    });
  });

  it("renders the studentContext annotation when the API returns it", async () => {
    searchParamsRef.current = new URLSearchParams({
      question: "q1",
      studentId: "stu_1",
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(
          makePayload({
            studentContext: {
              studentId: "stu_1",
              label: "Alice",
              selectedOptionId: "a",
              isCorrect: false,
              answeredAt: "2026-05-22T08:00:00Z",
              mode: "practice",
            },
          }),
        ),
        { status: 200 },
      ),
    );
    render(<QuestionDetailDrawer role="teacher" />);
    await waitFor(() => {
      expect(
        screen.getByTestId("question-detail-student-context"),
      ).toBeDefined();
    });
    expect(screen.getByText(/Alice/)).toBeDefined();
  });

  it("renders an error message when the fetch fails", async () => {
    searchParamsRef.current = new URLSearchParams({ question: "q1" });
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    render(<QuestionDetailDrawer role="teacher" />);
    await waitFor(() => {
      expect(screen.getByText(/Question not found/i)).toBeDefined();
    });
  });
});
