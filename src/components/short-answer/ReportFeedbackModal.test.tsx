import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportFeedbackModal } from "./ReportFeedbackModal";

describe("ReportFeedbackModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lets the student choose which part's feedback to report", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({
        ok: true,
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onReported = vi.fn();
    const onClose = vi.fn();

    render(
      <ReportFeedbackModal
        targets={[
          {
            partLabel: "A",
            partIndex: 0,
            attemptId: "attempt-a",
            reported: true,
          },
          {
            partLabel: "B",
            partIndex: 1,
            attemptId: "attempt-b",
            reported: false,
          },
        ]}
        questionId="question-1"
        onClose={onClose}
        onReported={onReported}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Report feedback for Part A",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Report feedback for Part B" }),
    );
    expect(screen.getByText("Report feedback — Part B")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "This explanation conflicts with the prompt." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to teacher" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      attemptId: "attempt-b",
      questionId: "question-1",
      partLabel: "B",
      note: "This explanation conflicts with the prompt.",
    });
    expect(onReported).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
