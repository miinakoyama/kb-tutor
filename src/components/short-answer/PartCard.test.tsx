import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PartCard } from "./PartCard";
import type { ShortAnswerPart } from "@/types/short-answer";

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

function renderPartCard(initialValue = "") {
  return render(
    <PartCard
      part={part}
      index={0}
      status="active"
      attempts={[]}
      maxAttempts={2}
      latestFeedback={null}
      triesLeft={2}
      reported={false}
      initialValue={initialValue}
      onCheck={vi.fn()}
      onOpenAttempt={vi.fn()}
      onReport={vi.fn()}
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
        index={0}
        status="active"
        attempts={[]}
        maxAttempts={2}
        latestFeedback={null}
        triesLeft={2}
        reported={false}
        initialValue="DNA"
        onCheck={vi.fn()}
        onOpenAttempt={vi.fn()}
        onReport={vi.fn()}
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
});
