import type { Question } from "@/types/question";
import type { GradedFeedback, PartLabel, ShortAnswerItem } from "@/types/short-answer";

export interface AssignmentMcqAnswer {
  kind: "mcq";
  selectedOptionId: string | null;
  isCorrect: boolean;
}

export interface AssignmentShortAnswerPartAttempt {
  partLabel: PartLabel;
  attemptNumber: number;
  responseText: string;
  isCorrect: boolean;
  feedback: GradedFeedback;
  answeredAt: string;
}

export interface AssignmentShortAnswerPartAnswer {
  partLabel: PartLabel;
  attempts: AssignmentShortAnswerPartAttempt[];
  isCorrect: boolean;
}

export interface AssignmentShortAnswerAnswer {
  kind: "short-answer";
  parts: AssignmentShortAnswerPartAnswer[];
  isCorrect: boolean;
  answered: boolean;
}

export type AssignmentHistoryAnswer =
  | AssignmentMcqAnswer
  | AssignmentShortAnswerAnswer;

export interface AssignmentHistoryItem {
  question: Question;
  answer: AssignmentHistoryAnswer | null;
}

export interface McqAttemptRow {
  question_id: string;
  selected_option_id: string | null;
  is_correct: boolean;
  answered_at: string | null;
}

export interface ShortAnswerAttemptRow {
  question_id: string;
  part_label: string;
  attempt_number: number;
  response_text: string;
  is_correct: boolean;
  feedback: unknown;
  answered_at: string | null;
}

const PART_LABELS = new Set<PartLabel>(["A", "B", "C"]);

function parseAnsweredAtMs(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isWithinWindow(ms: number, prevMs: number, endMs: number): boolean {
  return ms > prevMs && ms <= endMs;
}

function isGradedFeedback(value: unknown): value is GradedFeedback {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.verdict === "string" && Array.isArray(record.segments);
}

function asPartLabel(value: string): PartLabel | null {
  return PART_LABELS.has(value as PartLabel) ? (value as PartLabel) : null;
}

export function buildLatestMcqAttemptsByQuestion(
  rows: McqAttemptRow[],
  prevCompletedAt: string | null,
  completedAt: string,
): Map<string, { selectedOptionId: string | null; isCorrect: boolean }> {
  const prevMs = prevCompletedAt ? new Date(prevCompletedAt).getTime() : -Infinity;
  const endMs = new Date(completedAt).getTime();
  const latest = new Map<
    string,
    { selectedOptionId: string | null; isCorrect: boolean; answeredAt: number }
  >();

  for (const row of rows) {
    const ms = parseAnsweredAtMs(row.answered_at);
    if (ms === null || !isWithinWindow(ms, prevMs, endMs)) continue;
    const qid = String(row.question_id);
    const next = {
      selectedOptionId:
        typeof row.selected_option_id === "string" ? row.selected_option_id : null,
      isCorrect: Boolean(row.is_correct),
      answeredAt: ms,
    };
    const prior = latest.get(qid);
    if (!prior || ms >= prior.answeredAt) {
      latest.set(qid, next);
    }
  }

  return new Map(
    Array.from(latest.entries()).map(([qid, entry]) => [
      qid,
      {
        selectedOptionId: entry.selectedOptionId,
        isCorrect: entry.isCorrect,
      },
    ]),
  );
}

export function buildShortAnswerAttemptsByQuestion(
  rows: ShortAnswerAttemptRow[],
  prevCompletedAt: string | null,
  completedAt: string,
): Map<string, AssignmentShortAnswerPartAttempt[]> {
  const prevMs = prevCompletedAt ? new Date(prevCompletedAt).getTime() : -Infinity;
  const endMs = new Date(completedAt).getTime();
  const grouped = new Map<string, AssignmentShortAnswerPartAttempt[]>();

  for (const row of rows) {
    const ms = parseAnsweredAtMs(row.answered_at);
    if (ms === null || !isWithinWindow(ms, prevMs, endMs)) continue;
    const partLabel = asPartLabel(String(row.part_label));
    if (!partLabel) continue;

    const qid = String(row.question_id);
    const feedback = isGradedFeedback(row.feedback)
      ? row.feedback
      : { verdict: "incorrect" as const, segments: [] };

    const list = grouped.get(qid) ?? [];
    list.push({
      partLabel,
      attemptNumber: Number(row.attempt_number),
      responseText: String(row.response_text ?? ""),
      isCorrect: Boolean(row.is_correct),
      feedback,
      answeredAt: String(row.answered_at),
    });
    grouped.set(qid, list);
  }

  for (const [qid, attempts] of grouped.entries()) {
    grouped.set(
      qid,
      attempts.sort((a, b) => {
        const labelCmp = a.partLabel.localeCompare(b.partLabel);
        if (labelCmp !== 0) return labelCmp;
        return a.attemptNumber - b.attemptNumber;
      }),
    );
  }

  return grouped;
}

export function buildShortAnswerHistoryAnswer(
  item: ShortAnswerItem,
  attempts: AssignmentShortAnswerPartAttempt[],
): AssignmentShortAnswerAnswer {
  const parts: AssignmentShortAnswerPartAnswer[] = item.parts.map((part) => {
    const partAttempts = attempts.filter((attempt) => attempt.partLabel === part.label);
    const isCorrect = partAttempts.some((attempt) => attempt.isCorrect);
    return {
      partLabel: part.label,
      attempts: partAttempts,
      isCorrect,
    };
  });

  const answered = parts.every((part) => part.attempts.length > 0);
  const isCorrect = answered && parts.every((part) => part.isCorrect);

  return {
    kind: "short-answer",
    parts,
    isCorrect,
    answered,
  };
}

export function buildHistoryAnswerForQuestion(
  question: Question,
  mcqAttempt: { selectedOptionId: string | null; isCorrect: boolean } | undefined,
  shortAnswerAttempts: AssignmentShortAnswerPartAttempt[] | undefined,
): AssignmentHistoryAnswer | null {
  if (shortAnswerAttempts && shortAnswerAttempts.length > 0 && question.shortAnswer) {
    return buildShortAnswerHistoryAnswer(question.shortAnswer, shortAnswerAttempts);
  }

  if (!mcqAttempt) return null;
  return {
    kind: "mcq",
    selectedOptionId: mcqAttempt.selectedOptionId,
    isCorrect: mcqAttempt.isCorrect,
  };
}

export function isHistoryAnswerCorrect(answer: AssignmentHistoryAnswer | null): boolean {
  if (!answer) return false;
  return answer.isCorrect;
}

export function isHistoryAnswerAnswered(answer: AssignmentHistoryAnswer | null): boolean {
  if (!answer) return false;
  if (answer.kind === "mcq") return answer.selectedOptionId !== null;
  return answer.answered;
}

export function summarizeHistoryItems(items: AssignmentHistoryItem[]): {
  total: number;
  answered: number;
  correct: number;
} {
  const answered = items.filter((item) => isHistoryAnswerAnswered(item.answer)).length;
  const correct = items.filter((item) => isHistoryAnswerCorrect(item.answer)).length;
  return { total: items.length, answered, correct };
}

export function orderedQuestionIdsFromAttempts(
  mcqRows: McqAttemptRow[],
  shortAnswerRows: ShortAnswerAttemptRow[],
  prevCompletedAt: string | null,
  completedAt: string,
): string[] {
  const prevMs = prevCompletedAt ? new Date(prevCompletedAt).getTime() : -Infinity;
  const endMs = new Date(completedAt).getTime();
  const firstSeen = new Map<string, number>();

  const record = (qid: string, ms: number) => {
    const prior = firstSeen.get(qid);
    if (prior === undefined || ms < prior) {
      firstSeen.set(qid, ms);
    }
  };

  for (const row of mcqRows) {
    const ms = parseAnsweredAtMs(row.answered_at);
    if (ms === null || !isWithinWindow(ms, prevMs, endMs)) continue;
    record(String(row.question_id), ms);
  }

  for (const row of shortAnswerRows) {
    const ms = parseAnsweredAtMs(row.answered_at);
    if (ms === null || !isWithinWindow(ms, prevMs, endMs)) continue;
    record(String(row.question_id), ms);
  }

  return Array.from(firstSeen.entries())
    .sort(([, a], [, b]) => a - b)
    .map(([qid]) => qid);
}
