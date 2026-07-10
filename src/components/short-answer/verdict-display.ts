import type { FeedbackVerdict } from "@/types/short-answer";

export interface VerdictDisplay {
  /** Short supportive phrase shown in the verdict row. */
  phrase: string;
  /** Status glyph (kept text-based for a11y; never the only signal). */
  glyph: string;
  /** Binary tone used to color the feedback block (no amber/partial). */
  tone: "correct" | "incorrect" | "neutral";
}

/**
 * Maps a feedback verdict to its supportive phrase, glyph, and binary tone.
 * "Good try!" / "Good start!" phrasing carries encouragement without a partial
 * color band (spec: binary correct/incorrect only).
 */
export function verdictDisplay(
  verdict: FeedbackVerdict,
  isFinalAttempt: boolean,
): VerdictDisplay {
  switch (verdict) {
    case "correct":
      return { phrase: "Correct!", glyph: "✓", tone: "correct" };
    case "good_start":
      return { phrase: "Good start!", glyph: "~", tone: "incorrect" };
    case "heres_the_idea":
      return { phrase: "Here's the idea", glyph: "✗", tone: "incorrect" };
    case "no_response":
      return { phrase: "No answer yet", glyph: "–", tone: "neutral" };
    case "good_try":
    default:
      return {
        phrase: isFinalAttempt ? "Here's the idea" : "Good try!",
        glyph: "✗",
        tone: "incorrect",
      };
  }
}
