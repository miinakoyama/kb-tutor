import type { Question } from "@/types/question";

/**
 * Per-question resume state sent to the student-facing practice client.
 *
 * New rows are keyed by question set + question id so assignments can contain
 * different generated questions that reuse the same id. Legacy rows without
 * a set id retain the question-id key for backward compatibility.
 */
export type AnsweredEntry = {
  selectedOptionId: string | null;
  isCorrect: boolean;
  answeredAt: string;
};

export type AnsweredMap = Record<string, AnsweredEntry>;

export type AttemptRow = {
  question_id: unknown;
  question_set_id?: unknown;
  selected_option_id: unknown;
  is_correct: unknown;
  answered_at: unknown;
};

const SCOPED_ANSWER_PREFIX = "set-question:";

export function answeredQuestionKey(
  questionSetId: unknown,
  questionId: string,
): string {
  return typeof questionSetId === "string" && questionSetId
    ? `${SCOPED_ANSWER_PREFIX}${questionSetId}\0${questionId}`
    : questionId;
}

export function answeredEntryForQuestion(
  answered: AnsweredMap,
  question: Pick<Question, "id" | "questionSetId">,
): AnsweredEntry | undefined {
  return answered[
    answeredQuestionKey(question.questionSetId, question.id)
  ] ?? answered[question.id];
}

/**
 * Build the resume map for a single assignment run.
 *
 * Important: attempts that happened on or before `lastCompletedAt` are
 * filtered out. This lets a student who already completed an assignment hit
 * Restart and get a fresh 0/N session without needing to destructively delete
 * their prior attempt history.
 *
 * The incoming attempts are expected to be ordered by `answered_at` ascending,
 * so that when the same question is answered multiple times in the current
 * run (e.g. they navigated back and changed their pick in exam mode), the
 * LATEST entry wins and is what ends up in the map.
 */
export function buildAnsweredMap(
  attempts: AttemptRow[],
  options: { lastCompletedAt: string | null },
): AnsweredMap {
  const lastCompletedMs = options.lastCompletedAt
    ? new Date(options.lastCompletedAt).getTime()
    : null;

  const map: AnsweredMap = {};
  for (const row of attempts) {
    const answeredAt =
      typeof row.answered_at === "string" ? row.answered_at : "";
    if (!answeredAt) continue;
    if (lastCompletedMs !== null) {
      const ms = new Date(answeredAt).getTime();
      if (Number.isNaN(ms) || ms <= lastCompletedMs) {
        continue;
      }
    }
    const qid = typeof row.question_id === "string" ? row.question_id : "";
    if (!qid) continue;
    const selectedOptionId =
      typeof row.selected_option_id === "string"
        ? row.selected_option_id
        : null;
    // Short-answer summary rows are derived from short_answer_attempts so a
    // single resolved part cannot mark the whole question complete.
    if (selectedOptionId === "short-answer") continue;
    map[answeredQuestionKey(row.question_set_id, qid)] = {
      selectedOptionId,
      isCorrect: Boolean(row.is_correct),
      answeredAt,
    };
  }
  return map;
}

/**
 * Utility used when we only need to know which question ids have a current-
 * run answer — e.g. list-page progress counts — without the full payload.
 */
export function countAnsweredQuestions(
  attempts: AttemptRow[],
  options: { lastCompletedAt: string | null },
): number {
  return Object.keys(buildAnsweredMap(attempts, options)).length;
}

/**
 * Extract the non-empty string ids from a list of questions. Centralized so
 * the route handler stays focused on I/O rather than shape-guarding.
 */
export function collectQuestionIds(questions: Question[]): string[] {
  return questions
    .map((q) => q.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}
