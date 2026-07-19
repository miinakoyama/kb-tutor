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
 * Both wrong attempts share the same "Feedback" label — they differ only in the
 * feedback body, not the header. Binary correct/incorrect tone only (spec: no
 * partial color band).
 */
export function verdictDisplay(verdict: FeedbackVerdict): VerdictDisplay {
  switch (verdict) {
    case "correct":
      return { phrase: "Correct!", glyph: "✓", tone: "correct" };
    case "good_start":
      return { phrase: "Good start!", glyph: "~", tone: "incorrect" };
    case "heres_the_idea":
      return { phrase: "Feedback", glyph: "✗", tone: "incorrect" };
    case "no_response":
      return { phrase: "No answer yet", glyph: "–", tone: "neutral" };
    case "good_try":
    default:
      return { phrase: "Feedback", glyph: "✗", tone: "incorrect" };
  }
}
