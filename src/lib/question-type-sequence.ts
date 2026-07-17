import type { Question, QuestionTypeSelection } from "@/types/question";
import { shuffleArray } from "@/lib/array-utils";

/** Self-practice "Mixed" mode serves 3 MCQ then 1 SAQ, repeating. */
export const MIXED_PATTERN_LENGTH = 4;

function isShortAnswer(question: Question): boolean {
  return question.questionType === "open-ended";
}

function questionIdentityKey(
  question: Pick<Question, "id" | "questionSetId">,
): string {
  return question.questionSetId
    ? `scoped:${JSON.stringify([question.questionSetId, question.id])}`
    : `legacy:${question.id}`;
}

function extendPool(pool: Question[], minLength: number): Question[] {
  if (pool.length === 0) return [];
  let extended = shuffleArray(pool);
  while (extended.length < minLength) {
    extended = [...extended, ...shuffleArray(pool)];
  }
  return extended;
}

/**
 * Builds the next session batch following the 3 MCQ : 1 SAQ pattern.
 * Previously served questions preserve the global cadence and exclude SAQs
 * that have already appeared in an earlier batch.
 * SAQ questions are never repeated; once the SAQ pool is exhausted, the
 * remaining SAQ slots fall back to MCQ (which may repeat via reshuffle).
 */
export function buildMixedQuestionSequence(
  questions: Question[],
  count: number,
  previousQuestions: readonly Question[] = [],
): Question[] {
  if (count <= 0) return [];
  const mcqPool = questions.filter((question) => !isShortAnswer(question));
  const servedSaqKeys = new Set(
    previousQuestions.filter(isShortAnswer).map(questionIdentityKey),
  );
  const allSaqQuestions = questions.filter(isShortAnswer);
  const freshSaqQuestions = allSaqQuestions.filter(
    (question) => !servedSaqKeys.has(questionIdentityKey(question)),
  );
  // An all-SAQ bank has no MCQ fallback. Once every SAQ has appeared, allow
  // the next batch to reuse the bank so the session can continue.
  const saqPool = shuffleArray(
    freshSaqQuestions.length > 0 || mcqPool.length > 0
      ? freshSaqQuestions
      : allSaqQuestions,
  );
  const extendedMcq = extendPool(mcqPool, count);

  const result: Question[] = [];
  let mcqIndex = 0;
  let saqIndex = 0;
  for (let slot = 0; slot < count; slot++) {
    const wantsSaq =
      (previousQuestions.length + slot) % MIXED_PATTERN_LENGTH === MIXED_PATTERN_LENGTH - 1;
    if (wantsSaq && saqIndex < saqPool.length) {
      result.push(saqPool[saqIndex]);
      saqIndex++;
      continue;
    }
    if (mcqIndex < extendedMcq.length) {
      result.push(extendedMcq[mcqIndex]);
      mcqIndex++;
      continue;
    }
    // No MCQ available at all (pool is entirely SAQ) — reuse SAQ so the
    // session still reaches the requested count.
    if (saqPool.length > 0) {
      result.push(saqPool[saqIndex % saqPool.length]);
      saqIndex++;
    }
  }
  return result;
}

/**
 * For the adaptive (BKT) engine, which selects one question at a time:
 * returns which format the given slot in the session should require, or
 * `undefined` when the selection places no constraint (no type filter set).
 */
export function requiredFormatForSelection(
  selection: QuestionTypeSelection | undefined,
  slotIndex: number,
): "mcq" | "saq" | undefined {
  if (selection === "mcq") return "mcq";
  if (selection === "open-ended") return "saq";
  if (selection === "mixed") {
    return slotIndex % MIXED_PATTERN_LENGTH === MIXED_PATTERN_LENGTH - 1 ? "saq" : "mcq";
  }
  return undefined;
}
