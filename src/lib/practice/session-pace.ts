import type { Question } from "@/types/question";

/** Weighted pace units between Continue / Finish check-ins. */
export const PRACTICE_PACE_THRESHOLD = 10;

/** One completed MCQ contributes this many pace units. */
export const MCQ_PACE_WEIGHT = 1;

/** One completed short-answer question contributes this many pace units. */
export const SAQ_PACE_WEIGHT = 2;

export function isShortAnswerQuestion(question: Question | undefined): boolean {
  return Boolean(
    question &&
      question.questionType === "open-ended" &&
      question.shortAnswer,
  );
}

export function paceWeightForQuestion(question: Question | undefined): number {
  if (!question) return 0;
  return isShortAnswerQuestion(question) ? SAQ_PACE_WEIGHT : MCQ_PACE_WEIGHT;
}

/**
 * Sum pace weights for completed question indices in the current session.
 * Indices without a matching question contribute 0.
 */
export function computeSessionPaceCount(
  questions: Question[],
  completedIndices: Iterable<number>,
): number {
  let total = 0;
  for (const index of completedIndices) {
    if (!Number.isInteger(index) || index < 0) continue;
    total += paceWeightForQuestion(questions[index]);
  }
  return total;
}

/** Highest completed checkpoint at or below the current pace count (0, 10, 20, …). */
export function practicePaceMilestone(
  paceCount: number,
  threshold: number = PRACTICE_PACE_THRESHOLD,
): number {
  if (threshold <= 0 || paceCount < threshold) return 0;
  return Math.floor(paceCount / threshold) * threshold;
}

export function shouldOfferPracticePaceCheckIn(options: {
  /** Open-ended Practice / Review only (not assignment runs). */
  enabled: boolean;
  paceCount: number;
  /** Last checkpoint already shown this session (0 if none). */
  lastOfferedMilestone: number;
  threshold?: number;
}): boolean {
  const threshold = options.threshold ?? PRACTICE_PACE_THRESHOLD;
  const milestone = practicePaceMilestone(options.paceCount, threshold);
  return (
    options.enabled &&
    milestone > 0 &&
    milestone > options.lastOfferedMilestone
  );
}
