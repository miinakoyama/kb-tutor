import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, forwardRef, Fragment, type ReactNode } from "react";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";
import { ShortAnswerQuestionView } from "./ShortAnswerQuestionView";

// Render framer-motion elements as their plain DOM tag so the test observes
// real component state (aria-labels) without waiting on animations that never
// settle under jsdom. AnimatePresence just renders its children.
vi.mock("framer-motion", () => {
  const FRAMER_ONLY = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "layout",
    "variants",
    "whileHover",
    "whileTap",
    "whileFocus",
    "mode",
  ]);
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const Motion = forwardRef<unknown, Record<string, unknown>>(
          (props, ref) => {
            const domProps: Record<string, unknown> = { ref };
            for (const [key, val] of Object.entries(props)) {
              if (!FRAMER_ONLY.has(key)) domProps[key] = val;
            }
            return createElement(tag, domProps);
          },
        );
        Motion.displayName = `motion.${tag}`;
        return Motion;
      },
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/lib/short-answer/tour-settings", () => ({
  isShortAnswerTourSeenLocally: () => true,
  syncShortAnswerTourSeen: async () => true,
}));

function gradeResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      attemptId: "attempt-1",
      score: 1,
      maxScore: 1,
      correct: true,
      resolved: true,
      feedback: {
        verdict: "correct",
        segments: [{ label: "", text: "Great — you named DNA." }],
      },
      triesLeft: 0,
    }),
  };
}

const feedbackMatcher = (content: string) =>
  content.includes("Great") && content.includes("DNA");

describe("ShortAnswerQuestionView collapse-on-advance", () => {
  const fetchMock = vi.fn(async () => gradeResponse());

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => gradeResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps feedback open after the countdown, then collapses it once the student starts the next part", async () => {
    const base = sampleShortAnswerItem as ShortAnswerItem;
    const item: ShortAnswerItem = {
      ...base,
      parts: [base.parts[0], base.parts[1]],
    };

    render(
      <ShortAnswerQuestionView
        item={item}
        questionId="q-collapse"
        assignmentId="assignment-1"
        mode="practice"
        continueLabel="Continue"
        onContinue={vi.fn()}
      />,
    );

    // Re-query inside waitFor so re-renders don't leave us holding a stale
    // disabled button reference. Retry the input until Check is enabled and
    // the grade request actually fires — under CI load a single change+click
    // can otherwise land before the controlled value commits.
    await waitFor(() => {
      if (fetchMock.mock.calls.length > 0) return;
      const answerA = screen.getByLabelText("Answer for Part A");
      fireEvent.input(answerA, { target: { value: "DNA" } });
      const checkButton = screen.getByRole("button", { name: "Check" });
      expect((answerA as HTMLTextAreaElement).value).toBe("DNA");
      expect((checkButton as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(checkButton);
      expect(fetchMock).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Feedback appears (part resolved, forced open during the countdown).
    await screen.findByText(feedbackMatcher, {}, { timeout: 5000 });

    // Wait for the 3s unlock countdown to finish: Part B becomes answerable.
    const answerB = await screen.findByLabelText(
      "Answer for Part B",
      {},
      { timeout: 5000 },
    );

    // Part A's feedback stays open on its own after the countdown (the toggle
    // reports the expanded "Collapse" state once the "keep open" effect settles).
    const collapseToggle = await screen.findByRole("button", { name: "Collapse" });
    expect(collapseToggle.getAttribute("aria-expanded")).toBe("true");
    const reportButton = screen.getByRole("button", { name: "Report feedback" });
    expect((reportButton as HTMLButtonElement).disabled).toBe(false);

    // Student moves on to Part B → Part A collapses automatically.
    fireEvent.input(answerB, { target: { value: "It carries genes." } });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Expand" }).getAttribute("aria-expanded"),
      ).toBe("false");
    });
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
    // Reporting remains available after moving on. The student chooses the
    // feedback's part explicitly instead of the toolbar guessing a target.
    expect((reportButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(reportButton);
    expect(
      screen.getByRole("dialog", { name: "Report feedback" }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Feedback to report") as HTMLSelectElement).value,
    ).toBe("attempt-1");
    expect(
      screen.getByRole("option", { name: "Part A · Attempt 1" }),
    ).toBeTruthy();
    expect(screen.getByText(feedbackMatcher)).toBeTruthy();
  }, 15000);
});
