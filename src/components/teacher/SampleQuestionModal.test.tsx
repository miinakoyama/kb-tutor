import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleQuestionModal } from "./SampleQuestionModal";
import type { SampleQuestionPayload } from "@/lib/analytics/teacher-analytics-types";

const fetchMock = vi.fn();

vi.mock("@/components/shared/LatexText", () => ({
  LatexText: ({ text }: { text: string }) => <span>{text}</span>,
}));

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => cleanup());

function makePayload(
  overrides: Partial<SampleQuestionPayload> = {},
): SampleQuestionPayload {
  return {
    questionId: "q1",
    preview: {
      text: "Sample stem",
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
    position: 0,
    totalAvailable: 3,
    isLast: false,
    mode: "random",
    seed: "seed-1",
    ...overrides,
  };
}

describe("SampleQuestionModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SampleQuestionModal
        open={false}
        standardId="3.1.9-12.A"
        standardLabel="A"
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("fetches with random mode by default and renders the question", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makePayload()), { status: 200 }),
    );
    render(
      <SampleQuestionModal
        open
        standardId="3.1.9-12.A"
        standardLabel="A"
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Sample stem")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("sampleMode=random");
    expect(calledUrl).toContain("skip=0");
  });

  it("re-fetches with the new mode when the user switches", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makePayload()), { status: 200 }),
    );
    render(
      <SampleQuestionModal
        open
        standardId="3.1.9-12.A"
        standardLabel="A"
        onClose={() => {}}
      />,
    );
    await waitFor(() => screen.getByText("Sample stem"));
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makePayload({ questionId: "q_low", preview: undefined as never }),
        ),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makePayload()), { status: 200 }),
    );
    fireEvent.click(screen.getByText(/Low accuracy first/i));
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      expect(String(lastCall?.[0])).toContain("sampleMode=low_accuracy_first");
    });
  });

  it("increments skip on Show another", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(makePayload()), { status: 200 }),
    );
    render(
      <SampleQuestionModal
        open
        standardId="3.1.9-12.A"
        standardLabel="A"
        onClose={() => {}}
      />,
    );
    await waitFor(() => screen.getByText("Sample stem"));
    fireEvent.click(screen.getByTestId("sample-show-another"));
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      expect(String(lastCall?.[0])).toContain("skip=1");
    });
  });

  it("disables Show another when isLast=true", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(makePayload({ isLast: true })),
        { status: 200 },
      ),
    );
    render(
      <SampleQuestionModal
        open
        standardId="3.1.9-12.A"
        standardLabel="A"
        onClose={() => {}}
      />,
    );
    await waitFor(() => screen.getByText("Sample stem"));
    const button = screen.getByTestId("sample-show-another") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toMatch(/No more questions/i);
  });

  it("renders the empty-bank state when questionId is null", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(
          makePayload({
            questionId: null,
            preview: null,
            totalAvailable: 0,
            isLast: true,
          }),
        ),
        { status: 200 },
      ),
    );
    render(
      <SampleQuestionModal
        open
        standardId="3.1.9-12.A"
        standardLabel="A"
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/No sample question available/i),
      ).toBeDefined();
    });
  });
});
