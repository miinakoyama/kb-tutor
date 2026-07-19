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
  PartLabel,
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

export function totalShortAnswerPoints(item: ShortAnswerItem): number {
  return item.parts.reduce((sum, part) => sum + part.maxScore, 0);
}

export function formatPartRubric(part: ShortAnswerPart): string {
  if (part.rubric) {
    return Object.entries(part.rubric.criteria)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([score, text]) => `${score} point${Number(score) === 1 ? "" : "s"}: ${text}`)
      .join("\n");
  }
  return part.scoringGuidance;
}

/**
 * Full-credit rubric text for a part, used as the "what was missing" context
 * for exam mode's single-attempt closure feedback when the grading method
 * didn't return a diagnosedGap (method 3 never does; method 2 only returns a
 * short failure-type code).
 */
export function partFullCreditCriteria(part: ShortAnswerPart): string {
  // Legacy parts can validate with scoringGuidance and no structured rubric
  // (item-schema.ts), so never assume part.rubric exists.
  const criteria = part.rubric?.criteria?.[String(part.maxScore)];
  if (criteria && criteria.trim().length > 0) return criteria.trim();
  return part.scoringGuidance.trim().length > 0
    ? part.scoringGuidance.trim()
    : "the correct concept for this part";
}

/**
 * Extract one part's answer from a whole-item annotated response. Score-max
 * annotated responses are typically keyed by part ("Part A: … Part B: …"); this
 * returns the segment for `label`, or null when the text is not part-keyed.
 */
function extractPartSegment(response: string, label: PartLabel): string | null {
  const re = new RegExp(
    `Part\\s+${label}\\b\\s*[:.\\)\\-]?\\s*([\\s\\S]*?)(?=\\bPart\\s+[A-C]\\b\\s*[:.\\)\\-]|$)`,
    "i",
  );
  const match = re.exec(response);
  const segment = match?.[1]?.trim();
  return segment && segment.length > 0 ? segment : null;
}

/**
 * Older generated items may store the full-credit response as ordered prose
 * without explicit Part A/B/C labels. Use it only when its clause boundaries
 * map one-to-one to the item's parts; returning the entire response for an
 * early part would reveal answers to later, still-locked parts.
 */
function extractOrderedPartSegment(
  response: string,
  partIndex: number,
  partCount: number,
): string | null {
  const candidates = [
    response.split(/\s*(?:;|\n+)\s*/u),
    response.split(/(?<=[.!?])\s+/u),
  ];

  for (const candidate of candidates) {
    const segments = candidate.map((value) => value.trim()).filter(Boolean);
    if (segments.length === partCount) {
      const segment = segments[partIndex];
      if (!segment) return null;
      return /[.!?]$/u.test(segment) ? segment : `${segment}.`;
    }
  }
  return null;
}

/**
 * Student-facing model answer for a part shown on a resolved incorrect final
 * attempt (FR-008). Per data-model.md the score-max annotated response is the
 * model-answer source; we surface this part's labeled or safely ordered segment,
 * falling back to a single-part item's whole response, then to the rubric's
 * full-credit criteria.
 */
export function partModelAnswer(
  item: ShortAnswerItem,
  part: ShortAnswerPart,
): string {
  const maxTotal = totalShortAnswerPoints(item);
  const full = item.annotatedResponses.find((r) => r.score === maxTotal);
  if (full && full.response.trim().length > 0) {
    const segment = extractPartSegment(full.response, part.label);
    if (segment) return segment;
    if (item.parts.length === 1) return full.response.trim();
    const partIndex = item.parts.findIndex((candidate) => candidate.label === part.label);
    if (partIndex >= 0) {
      const orderedSegment = extractOrderedPartSegment(
        full.response,
        partIndex,
        item.parts.length,
      );
      if (orderedSegment) return orderedSegment;
    }
  }
  return partFullCreditCriteria(part);
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
  /** True when no further attempts remain (real attempt 2, or exam's single attempt). */
  isFinalAttempt: boolean;
  item: ShortAnswerItem;
  /** The part being graded, used to source the model answer on a final miss. */
  part: ShortAnswerPart;
  attemptsRemaining: number;
  /** The student's own submitted text, used to pick glossary terms they didn't use. */
  studentResponse: string;
}

/**
 * Compose the structured feedback block shown to the student.
 * - correct → "correct" verdict, single confirming segment.
 * - incorrect, attempt remaining → Socratic segments (what's off + a guiding
 *   question), glossary chips (FR-007/FR-021).
 * - incorrect, final attempt → closing feedback plus the canonical model
 *   answer (FR-008).
 */
export function buildGradedFeedback(params: BuildFeedbackParams): GradedFeedback {
  const { rawFeedback, correct, isFinalAttempt, item, part } = params;

  if (correct) {
    return {
      verdict: "correct",
      segments: [{ label: "", text: rawFeedback }],
    };
  }

  if (isFinalAttempt) {
    return {
      verdict: "heres_the_idea",
      segments: [{ label: "Feedback", text: rawFeedback }],
      modelAnswer: partModelAnswer(item, part),
    };
  }

  const verdict: FeedbackVerdict = "good_try";
  return {
    verdict,
    segments: [{ label: "", text: rawFeedback }],
    glossaryTerms: selectGlossaryTerms(item, params.studentResponse),
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
