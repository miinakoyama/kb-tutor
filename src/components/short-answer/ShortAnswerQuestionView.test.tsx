import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem, ShortAnswerPart } from "@/types/short-answer";
import { ShortAnswerQuestionView } from "./ShortAnswerQuestionView";

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  }),
}));

vi.mock("@/lib/short-answer/tour-settings", () => ({
  isShortAnswerTourSeenLocally: () => true,
  syncShortAnswerTourSeen: async () => true,
}));

vi.mock("./PartCard", () => ({
  PartCard: ({
    part,
    checkDisabled,
  }: {
    part: ShortAnswerPart;
    checkDisabled?: boolean;
  }) => (
    <button type="button" disabled={checkDisabled}>
      Check Part {part.label}
    </button>
  ),
}));

describe("ShortAnswerQuestionView media gating", () => {
  it("disables checking while the stimulus illustration is loading", async () => {
    const item = sampleShortAnswerItem as ShortAnswerItem;

    render(
      <ShortAnswerQuestionView
        item={{ ...item, parts: [item.parts[0]] }}
        questionId="saq-media-pending"
        assignmentId="assignment-1"
        mode="practice"
        continueLabel="Continue"
        onContinue={vi.fn()}
        stimulusImageLoading
      />,
    );

    const checkButton = await screen.findByRole("button", {
      name: "Check Part A",
    });
    await waitFor(() => {
      expect((checkButton as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("shows the session question number next to part progress", async () => {
    const item = sampleShortAnswerItem as ShortAnswerItem;

    render(
      <ShortAnswerQuestionView
        item={{ ...item, parts: [item.parts[0]] }}
        questionId="saq-question-number"
        mode="practice"
        continueLabel="Continue"
        onContinue={vi.fn()}
        questionNumber={3}
      />,
    );

    expect(await screen.findByText("Question 3")).toBeTruthy();
  });
});
