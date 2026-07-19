import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportFeedbackModal } from "./ReportFeedbackModal";

describe("ReportFeedbackModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("previews and reports any selected part attempt in one form", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue({ ok: true, status: 201 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const onReported = vi.fn();
    const onClose = vi.fn();

    render(
      <ReportFeedbackModal
        targets={[
          {
            partLabel: "A",
            attemptId: "attempt-a-1",
            attemptNumber: 1,
            feedback: {
              verdict: "good_try",
              segments: [{ label: "Feedback", text: "Review the first clue." }],
            },
            reported: true,
          },
          {
            partLabel: "A",
            attemptId: "attempt-a-2",
            attemptNumber: 2,
            feedback: {
              verdict: "heres_the_idea",
              segments: [{ label: "Feedback", text: "Review the molecule type." }],
              modelAnswer: "mRNA carries the genetic code.",
            },
            reported: false,
          },
          {
            partLabel: "B",
            attemptId: "attempt-b-1",
            attemptNumber: 1,
            feedback: {
              verdict: "good_try",
              segments: [{ label: "Feedback", text: "Check the codon definition." }],
            },
            reported: false,
          },
        ]}
        questionId="question-1"
        onClose={onClose}
        onReported={onReported}
      />,
    );

    const targetSelect = screen.getByLabelText(
      "Feedback to report",
    ) as HTMLSelectElement;
    expect(document.activeElement).toBe(targetSelect);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(
      (
        screen.getByRole("option", {
          name: "Part A · Attempt 1 — Reported",
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);
    expect(targetSelect.value).toBe("attempt-b-1");
    expect(screen.getByText("Check the codon definition.")).toBeTruthy();

    fireEvent.change(targetSelect, { target: { value: "attempt-a-2" } });
    expect(document.activeElement).toBe(targetSelect);
    expect(screen.getByText("Review the molecule type.")).toBeTruthy();
    expect(screen.getByText("Model answer")).toBeTruthy();
    expect(screen.getByText("mRNA carries the genetic code.")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "This explanation conflicts with the prompt." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to teacher" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      attemptId: "attempt-a-2",
      questionId: "question-1",
      partLabel: "A",
      note: "This explanation conflicts with the prompt.",
    });
    expect(onReported).toHaveBeenCalledWith("attempt-a-2");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
