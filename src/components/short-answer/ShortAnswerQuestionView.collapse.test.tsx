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

describe("ShortAnswerQuestionView collapse-on-advance", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => gradeResponse()));
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

    // Answer Part A.
    const answerA = await screen.findByLabelText("Answer for Part A");
    fireEvent.change(answerA, { target: { value: "DNA" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    // Feedback appears (part resolved, forced open during the countdown).
    await screen.findByText("Great — you named DNA.");

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

    // Student moves on to Part B → Part A collapses automatically.
    fireEvent.change(answerB, { target: { value: "It carries genes." } });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Expand" }).getAttribute("aria-expanded"),
      ).toBe("false");
    });
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
  });
});
