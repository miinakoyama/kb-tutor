/**
 * Shared grading utilities used by all three methods.
 *
 * Methods return a raw score + a single student-facing feedback string
 * (matching the reference project's contract). This module maps that into the
 * app's structured `GradedFeedback` (verdict, segments, optional model answer,
 * glossary terms) based on the attempt context (FR-007 / FR-008).
 */

import type {
  FeedbackVerdict,
  GradedFeedback,
  ShortAnswerItem,
  ShortAnswerPart,
} from "@/types/short-answer";

export function normalizeScore(value: unknown, maxScore: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maxScore, Math.round(value)));
}

/** Depth-first extraction of a usable feedback string from arbitrary JSON. */
export function extractFeedbackText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map(extractFeedbackText)
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" ") : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      "feedback",
      "student_feedback",
      "formative_feedback",
      "feedback_message",
      "message",
      "text",
      "hint",
      "cue",
      "guiding_question",
      "next_step",
    ];

    for (const key of preferredKeys) {
      const text = extractFeedbackText(record[key]);
      if (text) return text;
    }

    const parts = Object.values(record)
      .map(extractFeedbackText)
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" ") : null;
  }

  return null;
}

export function normalizeFeedback(value: unknown): string {
  return extractFeedbackText(value) ?? "No feedback returned.";
}

/**
 * The model answer for a failed final attempt: from the item's full-credit
 * annotated response (score = pointsPossible). Spec assumption "Model answer
 * source". If a per-part slice cannot be isolated we return the whole
 * full-credit response, which is written per-part in generated items.
 */
export function deriveModelAnswer(
  item: ShortAnswerItem,
  part: ShortAnswerPart,
): string | undefined {
  const full = item.annotatedResponses.find(
    (r) => r.score === item.scoringRubric.pointsPossible,
  );
  if (!full) return undefined;
  const text = full.response;
  // Generated items key each part inside the full response as "Part A: ...".
  const marker = new RegExp(
    `Part\\s*${part.label}\\s*[:\\-]\\s*([\\s\\S]*?)(?=Part\\s*[ABC]\\s*[:\\-]|$)`,
    "i",
  );
  const match = text.match(marker);
  const sliced = match?.[1]?.trim();
  return sliced && sliced.length > 0 ? sliced : text.trim();
}

/**
 * Glossary terms relevant to a miss: key terms whose vocabulary does NOT
 * already appear in the student's response (so chips surface unfamiliar
 * vocabulary). Capped to keep the chip row short.
 */
export function selectGlossaryTerms(
  item: ShortAnswerItem,
  studentResponse: string,
  limit = 3,
): string[] {
  const lower = studentResponse.toLowerCase();
  const missing = item.keyTerms
    .map((t) => t.term)
    .filter((term) => !lower.includes(term.toLowerCase()));
  return missing.slice(0, limit);
}

export interface BuildFeedbackParams {
  rawFeedback: string;
  correct: boolean;
  /** True when no further attempts remain (attempt 2, or exam single attempt). */
  isFinalAttempt: boolean;
  /** 1 or 2; attempt-2 finals use LLM closure feedback instead of annotated model answer. */
  attemptNumber?: number;
  item: ShortAnswerItem;
  part: ShortAnswerPart;
  attemptsRemaining: number;
}

/**
 * Compose the structured feedback block shown to the student.
 * - correct → "correct" verdict, single confirming segment, no model answer.
 * - incorrect, attempt remaining → Socratic segments (what's off + a guiding
 *   question), glossary chips, NO model answer (FR-007/FR-021).
 * - incorrect, final attempt (attempt 2) → LLM closure feedback in segments
 *   (reference attempt2 pipeline; no annotated model-answer card).
 * - incorrect, final attempt (single-attempt / exam) → plain model answer only.
 */
export function buildGradedFeedback(params: BuildFeedbackParams): GradedFeedback {
  const {
    rawFeedback,
    correct,
    isFinalAttempt,
    attemptNumber = 1,
    item,
    part,
  } = params;

  if (correct) {
    return {
      verdict: "correct",
      segments: [{ label: "", text: rawFeedback }],
    };
  }

  if (isFinalAttempt && attemptNumber === 2) {
    return {
      verdict: "heres_the_idea",
      segments: [{ label: "", text: rawFeedback }],
    };
  }

  if (isFinalAttempt) {
    return {
      verdict: "heres_the_idea",
      segments: [],
      modelAnswer: deriveModelAnswer(item, part) ?? rawFeedback,
    };
  }

  const verdict: FeedbackVerdict = "good_try";
  return {
    verdict,
    segments: [{ label: "", text: rawFeedback }],
    glossaryTerms: selectGlossaryTerms(item, params.rawFeedback),
  };
}

/** The fixed result for an empty submission (no LLM call, FR-011). */
export function emptySubmissionFeedback(): GradedFeedback {
  return {
    verdict: "no_response",
    segments: [
      {
        label: "",
        text: "No response was submitted. Type an answer and check again.",
      },
    ],
  };
}

/** Flatten stored feedback JSON into plain text for attempt-2 prompts. */
export function feedbackToPlainText(feedback: GradedFeedback | unknown): string {
  if (!feedback || typeof feedback !== "object") return "";
  const record = feedback as GradedFeedback;
  if (typeof record.modelAnswer === "string" && record.modelAnswer.trim()) {
    return record.modelAnswer.trim();
  }
  return record.segments
    ?.map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");
}
