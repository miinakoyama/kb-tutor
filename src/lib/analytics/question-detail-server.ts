import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";
import { percentile } from "@/lib/analytics/percentile";
import type { AttemptMode } from "@/lib/analytics/teacher-dashboard-server";
import {
  ATTEMPT_MODES_TUPLE,
  emptyPerMode,
  type OptionDistribution,
  type PerModeMetrics,
  type QuestionDetailPayload,
  type QuestionPreview,
  type ScopeMode,
} from "@/lib/analytics/teacher-analytics-types";

export interface QuestionDetailAttemptRow {
  user_id: string;
  question_id: string;
  mode: string | null;
  assignment_id: string | null;
  selected_option_id: string;
  is_correct: boolean;
  time_spent_sec: number | null;
  answered_at: string;
}

export interface BuildQuestionDetailInput {
  attempts: readonly QuestionDetailAttemptRow[];
  preview: QuestionPreview | null;
  questionId: string;
  standardId: string | null;
  standardLabel: string | null;
  scope: ScopeMode;
  studentContext?: {
    studentId: string;
    label: string;
  };
}

function coerceMode(raw: string | null): AttemptMode {
  return ATTEMPT_MODES_TUPLE.find((m) => m === raw) ?? "practice";
}

function safeRatio(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

function safeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/**
 * Build the Question detail drawer payload from a pre-fetched array
 * of `attempts` rows for a single `question_id`, already scoped to the
 * teacher's students.
 *
 * Notes:
 *  - empty in-scope attempts → `summary` and `byMode` zeros (never
 *    `NaN`) and `optionDistribution` shows every option in the preview
 *    with `picks=0, share=0`;
 *  - exam-attempt dedupe is applied so totals match the parent
 *    standard drill-down (SC-003 invariant);
 *  - when `studentContext` is provided AND that student has at least
 *    one in-scope attempt on this question, the latest such attempt is
 *    surfaced as the inline annotation; if the student has no in-scope
 *    attempts on the question, the `studentContext` field is omitted
 *    (no leak).
 */
export function buildQuestionDetail(
  input: BuildQuestionDetailInput,
): QuestionDetailPayload {
  const deduped = dedupeAssignmentExamAttempts(input.attempts);

  const totalAttempts = deduped.length;
  const totalCorrect = deduped.reduce(
    (sum, row) => sum + (row.is_correct ? 1 : 0),
    0,
  );
  const students = new Set<string>();
  const times: number[] = [];
  const byModeBuckets: Record<AttemptMode, {
    attempted: number;
    correct: number;
    times: number[];
  }> = {
    practice: { attempted: 0, correct: 0, times: [] },
    exam: { attempted: 0, correct: 0, times: [] },
    review: { attempted: 0, correct: 0, times: [] },
  };
  const perOption = new Map<string, { picks: number; isCorrect: boolean }>();

  for (const row of deduped) {
    students.add(row.user_id);
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      times.push(row.time_spent_sec);
    }
    const m = coerceMode(row.mode);
    byModeBuckets[m].attempted += 1;
    if (row.is_correct) byModeBuckets[m].correct += 1;
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      byModeBuckets[m].times.push(row.time_spent_sec);
    }
    const opt = perOption.get(row.selected_option_id) ?? {
      picks: 0,
      isCorrect: row.is_correct,
    };
    opt.picks += 1;
    opt.isCorrect = opt.isCorrect || row.is_correct;
    perOption.set(row.selected_option_id, opt);
  }

  const byMode: Record<AttemptMode, PerModeMetrics> = emptyPerMode();
  for (const mode of ATTEMPT_MODES_TUPLE) {
    const bucket = byModeBuckets[mode];
    byMode[mode] = {
      attempted: bucket.attempted,
      correct: bucket.correct,
      accuracy: safeRatio(bucket.correct, bucket.attempted),
      averageTimeSec: safeAverage(bucket.times),
    };
  }

  const denomForShares = totalAttempts > 0 ? totalAttempts : 0;
  const optionDistribution: OptionDistribution[] = [];
  const seen = new Set<string>();
  if (input.preview) {
    for (const option of input.preview.options) {
      const observed = perOption.get(option.id);
      optionDistribution.push({
        optionId: option.id,
        text: option.text,
        isCorrect: option.id === input.preview.correctOptionId,
        picks: observed?.picks ?? 0,
        share: denomForShares > 0 ? safeRatio(observed?.picks ?? 0, denomForShares) : 0,
      });
      seen.add(option.id);
    }
  }
  for (const [optionId, observed] of perOption) {
    if (seen.has(optionId)) continue;
    optionDistribution.push({
      optionId,
      text: optionId,
      isCorrect: observed.isCorrect,
      picks: observed.picks,
      share: denomForShares > 0 ? safeRatio(observed.picks, denomForShares) : 0,
    });
  }

  let studentContext: QuestionDetailPayload["studentContext"];
  if (input.studentContext) {
    const studentAttempts = deduped
      .filter((row) => row.user_id === input.studentContext!.studentId)
      .sort((a, b) => b.answered_at.localeCompare(a.answered_at));
    const latest = studentAttempts[0];
    if (latest) {
      studentContext = {
        studentId: input.studentContext.studentId,
        label: input.studentContext.label,
        selectedOptionId: latest.selected_option_id,
        isCorrect: Boolean(latest.is_correct),
        answeredAt: latest.answered_at,
        mode: coerceMode(latest.mode),
      };
    }
  }

  return {
    questionId: input.questionId,
    preview: input.preview,
    standardId: input.standardId,
    standardLabel: input.standardLabel,
    scope: input.scope,
    summary: {
      totalAttempts,
      uniqueStudents: students.size,
      correct: totalCorrect,
      accuracy: safeRatio(totalCorrect, totalAttempts),
      averageTimeSec: safeAverage(times),
      timeP50Sec: percentile(times, 0.5),
      timeP90Sec: percentile(times, 0.9),
    },
    byMode,
    optionDistribution,
    studentContext,
  };
}
