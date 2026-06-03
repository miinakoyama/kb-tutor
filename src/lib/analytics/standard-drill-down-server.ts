import {
  STANDARD_ON_TRACK_MIN_ACCURACY,
  STANDARD_WATCH_MIN_ACCURACY,
} from "@/lib/analytics/constants";
import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";
import type { AttemptMode } from "@/lib/analytics/teacher-dashboard-server";
import {
  ATTEMPT_MODES_TUPLE,
  emptyPerMode,
  type AccuracyBucket,
  type OptionDistribution,
  type PerModeMetrics,
  type QuestionInStandardRow,
  type QuestionPreview,
  type StandardDrillDownPayload,
} from "@/lib/analytics/teacher-analytics-types";

/**
 * Single attempt row, in the shape the Postgres query returns. The
 * aggregator never touches Supabase directly — the route handler hands
 * it pre-fetched rows so this function stays a pure unit-testable
 * transform.
 */
export interface DrillDownAttemptRow {
  user_id: string;
  question_id: string;
  mode: string | null;
  assignment_id: string | null;
  selected_option_id: string;
  is_correct: boolean;
  time_spent_sec: number | null;
  answered_at: string;
}

interface BuildStandardDrillDownInput {
  attempts: readonly DrillDownAttemptRow[];
  previews: Map<string, QuestionPreview | null>;
  standardId: string;
  standardLabel: string;
}

function coerceMode(raw: string | null): AttemptMode {
  return ATTEMPT_MODES_TUPLE.find((m) => m === raw) ?? "practice";
}

function bucketFromAccuracy(accuracy: number): AccuracyBucket {
  const percent = accuracy * 100;
  if (percent >= STANDARD_ON_TRACK_MIN_ACCURACY) return "high";
  if (percent >= STANDARD_WATCH_MIN_ACCURACY) return "mid";
  return "low";
}

function safeAverage(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 0;
  const sum = finite.reduce((acc, v) => acc + v, 0);
  return sum / finite.length;
}

function safeRatio(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

/**
 * Build the Standard drill-down payload from a pre-fetched array of
 * `attempts` rows for a single standard.
 *
 * The function:
 *  - applies `dedupeAssignmentExamAttempts` so totals match the parent
 *    teacher dashboard;
 *  - groups by `question_id`;
 *  - returns only questions with `attempted >= 1`;
 *  - sorts rows by `accuracy ASC, attempted DESC, questionId ASC`;
 *  - derives the `bucket` from the existing `STANDARD_*` accuracy
 *    constants (low/mid/high traffic light shared with the dashboard);
 *  - excludes attempts with `time_spent_sec=null` from time averages
 *    (defined as 0 when no rows have a recorded time, so the UI can
 *    decide to render an em-dash);
 *  - computes per-option pick share against the question's total
 *    attempts so shares always sum to 1.0 ± floating-point noise.
 */
export function buildStandardDrillDown(
  input: BuildStandardDrillDownInput,
): StandardDrillDownPayload {
  const deduped = dedupeAssignmentExamAttempts(input.attempts);

  interface Bucket {
    questionId: string;
    attempts: DrillDownAttemptRow[];
    times: number[];
    correct: number;
    students: Set<string>;
    perMode: Record<
      AttemptMode,
      { attempted: number; correct: number; times: number[] }
    >;
    perOption: Map<string, { picks: number; isCorrect: boolean }>;
  }

  const byQuestion = new Map<string, Bucket>();
  for (const row of deduped) {
    const initial: Bucket = {
      questionId: row.question_id,
      attempts: [],
      times: [],
      correct: 0,
      students: new Set<string>(),
      perMode: {
        practice: { attempted: 0, correct: 0, times: [] },
        exam: { attempted: 0, correct: 0, times: [] },
        review: { attempted: 0, correct: 0, times: [] },
      },
      perOption: new Map(),
    };
    const bucket = byQuestion.get(row.question_id) ?? initial;
    bucket.attempts.push(row);
    bucket.students.add(row.user_id);
    if (row.is_correct) bucket.correct += 1;
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      bucket.times.push(row.time_spent_sec);
    }
    const mode = coerceMode(row.mode);
    bucket.perMode[mode].attempted += 1;
    if (row.is_correct) bucket.perMode[mode].correct += 1;
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      bucket.perMode[mode].times.push(row.time_spent_sec);
    }
    const opt = bucket.perOption.get(row.selected_option_id) ?? {
      picks: 0,
      isCorrect: row.is_correct,
    };
    opt.picks += 1;
    opt.isCorrect = opt.isCorrect || row.is_correct;
    bucket.perOption.set(row.selected_option_id, opt);
    byQuestion.set(row.question_id, bucket);
  }

  const rows: QuestionInStandardRow[] = [];
  for (const bucket of byQuestion.values()) {
    const attempted = bucket.attempts.length;
    if (attempted === 0) continue;
    const accuracy = safeRatio(bucket.correct, attempted);
    const byMode: Record<AttemptMode, PerModeMetrics> = emptyPerMode();
    for (const mode of ATTEMPT_MODES_TUPLE) {
      const m = bucket.perMode[mode];
      byMode[mode] = {
        attempted: m.attempted,
        correct: m.correct,
        accuracy: safeRatio(m.correct, m.attempted),
        averageTimeSec: safeAverage(m.times),
      };
    }
    const preview = input.previews.get(bucket.questionId) ?? null;
    const optionTexts = new Map<string, { text: string; isCorrect: boolean }>();
    if (preview) {
      for (const option of preview.options) {
        optionTexts.set(option.id, {
          text: option.text,
          isCorrect: option.id === preview.correctOptionId,
        });
      }
    }
    const optionDistribution: OptionDistribution[] = [];
    const optionIdsSeen = new Set<string>();
    if (preview) {
      for (const option of preview.options) {
        const observed = bucket.perOption.get(option.id);
        optionDistribution.push({
          optionId: option.id,
          text: option.text,
          isCorrect: option.id === preview.correctOptionId,
          picks: observed?.picks ?? 0,
          share: safeRatio(observed?.picks ?? 0, attempted),
        });
        optionIdsSeen.add(option.id);
      }
    }
    for (const [optionId, observed] of bucket.perOption) {
      if (optionIdsSeen.has(optionId)) continue;
      const meta = optionTexts.get(optionId);
      optionDistribution.push({
        optionId,
        text: meta?.text ?? optionId,
        isCorrect: meta?.isCorrect ?? observed.isCorrect,
        picks: observed.picks,
        share: safeRatio(observed.picks, attempted),
      });
    }
    rows.push({
      questionId: bucket.questionId,
      preview,
      attempted,
      uniqueStudents: bucket.students.size,
      correct: bucket.correct,
      accuracy,
      bucket: bucketFromAccuracy(accuracy),
      averageTimeSec: safeAverage(bucket.times),
      byMode,
      optionDistribution,
    });
  }

  rows.sort((a, b) => {
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    if (b.attempted !== a.attempted) return b.attempted - a.attempted;
    return a.questionId.localeCompare(b.questionId);
  });

  const totalAttempts = rows.reduce((sum, row) => sum + row.attempted, 0);
  const totalCorrect = rows.reduce((sum, row) => sum + row.correct, 0);
  const uniqueStudents = new Set<string>();
  for (const row of deduped) uniqueStudents.add(row.user_id);

  return {
    standardId: input.standardId,
    standardLabel: input.standardLabel,
    summary: {
      totalAttempts,
      totalCorrect,
      accuracy: safeRatio(totalCorrect, totalAttempts),
      uniqueStudents: uniqueStudents.size,
      questionsAttempted: rows.length,
    },
    questions: rows,
  };
}
