import type { AnsweredEntry } from "@/lib/assignments/answered-map";
import type { Question } from "@/types/question";
import type { GradedFeedback, PartLabel, ShortAnswerPart } from "@/types/short-answer";
import { isShortAnswerQuestion } from "@/lib/short-answer/question-guards";
import {
  buildPartRuntimesFromStoredAttempts,
  type StoredShortAnswerAttempt,
} from "@/lib/short-answer/attempt-state";

const PART_LABELS = new Set<PartLabel>(["A", "B", "C"]);

export type ShortAnswerAttemptDbRow = {
  id?: unknown;
  question_id?: unknown;
  part_label: unknown;
  attempt_number: unknown;
  response_text: unknown;
  feedback: unknown;
  is_correct: unknown;
  answered_at?: unknown;
};

function isPartLabel(value: unknown): value is PartLabel {
  return typeof value === "string" && PART_LABELS.has(value as PartLabel);
}

export function toStoredShortAnswerAttempts(
  rows: ShortAnswerAttemptDbRow[],
): StoredShortAnswerAttempt[] {
  const stored: StoredShortAnswerAttempt[] = [];
  for (const row of rows) {
    if (!isPartLabel(row.part_label)) continue;
    if (row.attempt_number !== 1 && row.attempt_number !== 2) continue;
    if (typeof row.response_text !== "string") continue;
    if (typeof row.is_correct !== "boolean") continue;
    stored.push({
      id: typeof row.id === "string" ? row.id : "",
      part_label: row.part_label,
      attempt_number: row.attempt_number,
      response_text: row.response_text,
      feedback: row.feedback as GradedFeedback,
      is_correct: row.is_correct,
    });
  }
  return stored;
}

export function evaluateShortAnswerQuestionCompletion(
  parts: ShortAnswerPart[],
  rows: ShortAnswerAttemptDbRow[],
  options?: { maxAttemptsPerPart?: number },
): {
  allResolved: boolean;
  allCorrect: boolean;
  latestAnsweredAt: string | null;
} {
  const stored = toStoredShortAnswerAttempts(rows);
  const { runtimes, allResolved } = buildPartRuntimesFromStoredAttempts(
    parts,
    stored,
    options,
  );
  const allCorrect = runtimes.every((runtime) =>
    runtime.attempts.some((attempt) => attempt.correct),
  );

  let latestAnsweredAt: string | null = null;
  for (const row of rows) {
    const answeredAt = typeof row.answered_at === "string" ? row.answered_at : "";
    if (!answeredAt) continue;
    if (!latestAnsweredAt || answeredAt > latestAnsweredAt) {
      latestAnsweredAt = answeredAt;
    }
  }

  return { allResolved, allCorrect, latestAnsweredAt };
}

function isAfterRunBoundary(
  answeredAt: string,
  lastCompletedAt: string | null,
): boolean {
  if (!lastCompletedAt) return true;
  const answeredMs = new Date(answeredAt).getTime();
  const boundaryMs = new Date(lastCompletedAt).getTime();
  if (Number.isNaN(answeredMs) || Number.isNaN(boundaryMs)) return false;
  return answeredMs > boundaryMs;
}

/**
 * Adds short-answer questions to the resume map only when every part is
 * resolved. Partial progress is intentionally omitted so students can resume
 * mid-question. Legacy per-part `attempts` rows are not trusted here.
 */
export function mergeShortAnswerIntoAnsweredMap(
  base: Record<string, AnsweredEntry>,
  questions: Question[],
  saqRows: ShortAnswerAttemptDbRow[],
  options: {
    lastCompletedAt: string | null;
    maxAttemptsPerPart?: number;
  },
): Record<string, AnsweredEntry> {
  const result = { ...base };
  const rowsByQuestion = new Map<string, ShortAnswerAttemptDbRow[]>();

  for (const row of saqRows) {
    const questionId = typeof row.question_id === "string" ? row.question_id : "";
    if (!questionId) continue;
    const answeredAt = typeof row.answered_at === "string" ? row.answered_at : "";
    if (!answeredAt || !isAfterRunBoundary(answeredAt, options.lastCompletedAt)) {
      continue;
    }
    const bucket = rowsByQuestion.get(questionId) ?? [];
    bucket.push(row);
    rowsByQuestion.set(questionId, bucket);
  }

  for (const question of questions) {
    if (!isShortAnswerQuestion(question) || !question.shortAnswer) continue;
    const rows = rowsByQuestion.get(question.id) ?? [];
    const completion = evaluateShortAnswerQuestionCompletion(
      question.shortAnswer.parts,
      rows,
      { maxAttemptsPerPart: options.maxAttemptsPerPart },
    );
    if (completion.allResolved && completion.latestAnsweredAt) {
      result[question.id] = {
        selectedOptionId: "short-answer",
        isCorrect: completion.allCorrect,
        answeredAt: completion.latestAnsweredAt,
      };
    } else {
      delete result[question.id];
    }
  }

  return result;
}
