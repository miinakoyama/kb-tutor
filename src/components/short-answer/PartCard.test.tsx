import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PartCard } from "./PartCard";
import type { GradedFeedback, ShortAnswerPart } from "@/types/short-answer";

const part: ShortAnswerPart = {
  label: "A",
  prompt: "Identify the molecule.",
  maxScore: 1,
  maxLength: 200,
  taskType: "identify",
  rubric: {
    pointsPossible: 1,
    criteria: { "0": "Does not name DNA.", "1": "Names DNA." },
  },
  scoringGuidance: "Full credit for DNA.",
};

function renderPartCard(initialValue = "", checkDisabled = false) {
  return render(
    <PartCard
      part={part}
      status="active"
      attempts={[]}
      maxAttempts={2}
      latestFeedback={null}
      triesLeft={2}
      initialValue={initialValue}
      checkDisabled={checkDisabled}
      onCheck={vi.fn()}
      onOpenAttempt={vi.fn()}
      onGlossaryClick={vi.fn()}
    />,
  );
}

describe("PartCard", () => {
  it("shows the last saved response when hydrated", () => {
    const { rerender } = renderPartCard();
    const answer = screen.getByLabelText("Answer for Part A");
    expect(answer).toBeInstanceOf(HTMLTextAreaElement);
    expect((answer as HTMLTextAreaElement).value).toBe("");

    rerender(
      <PartCard
        part={part}
        status="active"
        attempts={[]}
        maxAttempts={2}
        latestFeedback={null}
        triesLeft={2}
        initialValue="DNA"
        onCheck={vi.fn()}
        onOpenAttempt={vi.fn()}
        onGlossaryClick={vi.fn()}
      />,
    );

    expect((screen.getByLabelText("Answer for Part A") as HTMLTextAreaElement).value)
      .toBe("DNA");
  });

  it("keeps typed responses editable", () => {
    renderPartCard("DNA");
    const answer = screen.getByLabelText("Answer for Part A");
    fireEvent.change(answer, { target: { value: "DNA molecule" } });
    expect((answer as HTMLTextAreaElement).value).toBe("DNA molecule");
  });

  it("disables checking while the practice session is being prepared", () => {
    renderPartCard("DNA", true);
    const button = screen.getByRole("button", { name: "Preparing…" });
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps feedback open after the unlock countdown ends, and lets the student collapse it", () => {
    const feedback: GradedFeedback = {
      verdict: "correct",
      segments: [{ label: "", text: "Nice work naming DNA." }],
    };
    const resolvedProps = {
      part,
      status: "resolved" as const,
      attempts: [
        {
          attemptId: "attempt-1",
          attemptNumber: 1,
          correct: true,
          responseText: "DNA",
          feedback,
        },
      ],
      maxAttempts: 2,
      latestFeedback: feedback,
      triesLeft: 0,
      initialValue: "DNA",
      onCheck: vi.fn(),
      onOpenAttempt: vi.fn(),
      onGlossaryClick: vi.fn(),
    };

    // Countdown running: the card is forced open.
    const { rerender } = render(
      <PartCard
        {...resolvedProps}
        unlock={{ label: "Part B unlocks in", onUnlock: vi.fn() }}
      />,
    );
    expect(screen.getByText("Correct!")).toBeTruthy();

    // Countdown finished (unlock prop cleared): feedback stays open on its own
    // instead of auto-collapsing.
    rerender(<PartCard {...resolvedProps} />);
    expect(screen.getByText("Correct!")).toBeTruthy();

    // The student — and only the student — collapses it. The toggle reports
    // the collapsed state (asserting on framer-motion's exit-animated content
    // being gone is unreliable in jsdom, where the exit never completes).
    const toggle = screen.getByRole("button", { name: "Collapse" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Expand" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("auto-collapses once the student moves on to a later part", () => {
    const feedback: GradedFeedback = {
      verdict: "correct",
      segments: [{ label: "", text: "Nice work naming DNA." }],
    };
    const resolvedProps = {
      part,
      status: "resolved" as const,
      attempts: [
        {
          attemptId: "attempt-1",
          attemptNumber: 1,
          correct: true,
          responseText: "DNA",
          feedback,
        },
      ],
      maxAttempts: 2,
      latestFeedback: feedback,
      triesLeft: 0,
      initialValue: "DNA",
      onCheck: vi.fn(),
      onOpenAttempt: vi.fn(),
      onGlossaryClick: vi.fn(),
    };

    // Reach the open-after-countdown state: forced open during the countdown,
    // then pinned open once it clears (the previous test's flow).
    const { rerender } = render(
      <PartCard
        {...resolvedProps}
        laterPartEngaged={false}
        unlock={{ label: "Part B unlocks in", onUnlock: vi.fn() }}
      />,
    );
    rerender(<PartCard {...resolvedProps} laterPartEngaged={false} />);
    expect(
      screen.getByRole("button", { name: "Collapse" }).getAttribute("aria-expanded"),
    ).toBe("true");

    // Student starts the next part → this part collapses on its own.
    rerender(<PartCard {...resolvedProps} laterPartEngaged={true} />);
    expect(
      screen.getByRole("button", { name: "Expand" }).getAttribute("aria-expanded"),
    ).toBe("false");

    // Manual re-expand sticks — it isn't yanked closed again while the student
    // remains on the later part.
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    rerender(<PartCard {...resolvedProps} laterPartEngaged={true} />);
    expect(
      screen.getByRole("button", { name: "Collapse" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("keeps Check disabled on a retry until the answer is edited", () => {
    const feedback: GradedFeedback = {
      verdict: "good_try",
      segments: [{ label: "", text: "Not quite — try naming the molecule." }],
    };
    render(
      <PartCard
        part={part}
        status="active"
        attempts={[
          {
            attemptId: "attempt-1",
            attemptNumber: 1,
            correct: false,
            responseText: "DNA",
            feedback,
          },
        ]}
        maxAttempts={2}
        latestFeedback={feedback}
        triesLeft={1}
        initialValue="DNA"
        onCheck={vi.fn()}
        onOpenAttempt={vi.fn()}
        onGlossaryClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Check" });
    // Pre-filled with the previous answer, unchanged → disabled.
    expect((button as HTMLButtonElement).disabled).toBe(true);

    // Editing the answer enables it.
    fireEvent.change(screen.getByLabelText("Answer for Part A"), {
      target: { value: "DNA molecule" },
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    // Reverting to the exact previous answer disables it again.
    fireEvent.change(screen.getByLabelText("Answer for Part A"), {
      target: { value: "DNA" },
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("reports engagement only on real interaction, once", () => {
    const onEngage = vi.fn();
    render(
      <PartCard
        part={part}
        status="active"
        attempts={[]}
        maxAttempts={2}
        latestFeedback={null}
        triesLeft={2}
        initialValue=""
        onCheck={vi.fn()}
        onOpenAttempt={vi.fn()}
        onGlossaryClick={vi.fn()}
        onEngage={onEngage}
      />,
    );
    const answer = screen.getByLabelText("Answer for Part A");

    // Programmatic focus (as happens on unlock) must not count as engagement.
    (answer as HTMLTextAreaElement).focus();
    expect(onEngage).not.toHaveBeenCalled();

    // A real keystroke does — but only fires once.
    fireEvent.change(answer, { target: { value: "D" } });
    fireEvent.change(answer, { target: { value: "DN" } });
    expect(onEngage).toHaveBeenCalledTimes(1);
  });

  it("reports engagement on a click anywhere in the active card, not just the textarea", () => {
    const onEngage = vi.fn();
    render(
      <PartCard
        part={part}
        status="active"
        attempts={[]}
        maxAttempts={2}
        latestFeedback={null}
        triesLeft={2}
        initialValue=""
        onCheck={vi.fn()}
        onOpenAttempt={vi.fn()}
        onGlossaryClick={vi.fn()}
        onEngage={onEngage}
      />,
    );

    // Click the prompt text — a pointer-down outside the textarea still counts
    // as the student moving to this part (the handler is on the whole card).
    fireEvent.pointerDown(screen.getByText("Identify the molecule."));
    expect(onEngage).toHaveBeenCalledTimes(1);
  });
});
