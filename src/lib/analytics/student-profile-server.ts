import {
  STUDENT_ON_TRACK_MIN_ACCURACY,
  STUDENT_WATCH_MIN_ACCURACY,
} from "@/lib/analytics/constants";
import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";
import type { AttemptMode } from "@/lib/analytics/teacher-dashboard-server";
import {
  ATTEMPT_MODES_TUPLE,
  ROLLING_WINDOW_ATTEMPTS,
  SMALL_SAMPLE_THRESHOLD,
  STUDENT_ANSWER_PAGE_SIZE,
  type ChartPoint,
  type QuestionPreview,
  type StudentAttemptRow,
  type StudentProfilePayload,
  type StudentStatus,
} from "@/lib/analytics/teacher-analytics-types";

export interface StudentProfileAttemptRow {
  id: string;
  user_id: string;
  question_id: string;
  mode: string | null;
  assignment_id: string | null;
  standard_id: string | null;
  standard_label: string | null;
  selected_option_id: string;
  is_correct: boolean;
  time_spent_sec: number | null;
  answered_at: string;
}

export interface BuildStudentProfileInput {
  attempts: readonly StudentProfileAttemptRow[];
  student: {
    id: string;
    label: string;
    classId: string | null;
    classLabel: string;
  };
  previews: Map<string, QuestionPreview | null>;
  assignmentLabels: Map<string, string>;
  cursor: string | null;
  pageSize?: number;
}

function coerceMode(raw: string | null): AttemptMode {
  return ATTEMPT_MODES_TUPLE.find((m) => m === raw) ?? "practice";
}

function classifyStudent(
  accuracy: number,
  attempted: number,
): StudentStatus {
  if (attempted === 0) return "not_started";
  const percent = accuracy * 100;
  if (percent >= STUDENT_ON_TRACK_MIN_ACCURACY) return "on_track";
  if (percent >= STUDENT_WATCH_MIN_ACCURACY) return "watch";
  return "struggling";
}

function safeRatio(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

function safeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

function truncateStem(text: string, max = 200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Build the Student profile payload from a pre-fetched array of
 * `attempts` rows for a single student.
 *
 * Highlights:
 *  - applies `dedupeAssignmentExamAttempts`;
 *  - computes the time-series chart in a single O(n) pass with a
 *    20-attempt sliding window;
 *  - paginates the answer list via opaque cursor on `answered_at`
 *    with `attemptId ASC` tie-break (per FR-026);
 *  - resolves `assignmentLabel` to "Self-practice" when
 *    `assignment_id` is null;
 *  - derives the assignment / standard filter options from this
 *    student's actual attempt history (so the UI only offers
 *    selections that yield non-empty results).
 */
export function buildStudentProfile(
  input: BuildStudentProfileInput,
): StudentProfilePayload {
  const pageSize = input.pageSize ?? STUDENT_ANSWER_PAGE_SIZE;
  const deduped = dedupeAssignmentExamAttempts(input.attempts);

  // Order ASC by (answered_at, id) for the chart (oldest → newest).
  const chartOrdered = [...deduped].sort((a, b) => {
    const cmp = a.answered_at.localeCompare(b.answered_at);
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });

  const chart: ChartPoint[] = [];
  let cumulativeCorrect = 0;
  const window: number[] = [];
  for (let i = 0; i < chartOrdered.length; i += 1) {
    const row = chartOrdered[i];
    const correctFlag = row.is_correct ? 1 : 0;
    cumulativeCorrect += correctFlag;
    window.push(correctFlag);
    if (window.length > ROLLING_WINDOW_ATTEMPTS) window.shift();
    const cumulativeCount = i + 1;
    const rollingSum = window.reduce((sum, v) => sum + v, 0);
    chart.push({
      attemptIndex: cumulativeCount,
      answeredAt: row.answered_at,
      rollingAccuracy: safeRatio(rollingSum, window.length),
      cumulativeAccuracy: safeRatio(cumulativeCorrect, cumulativeCount),
      isSmallSample: cumulativeCount < SMALL_SAMPLE_THRESHOLD,
    });
  }

  // Order DESC by (answered_at, id) for the answer list (newest first),
  // tie-break is attemptId ASC at the same `answered_at` per FR-026.
  const descOrdered = [...deduped].sort((a, b) => {
    const cmp = b.answered_at.localeCompare(a.answered_at);
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });

  let pageRows = descOrdered;
  if (input.cursor) {
    const cursorIndex = descOrdered.findIndex(
      (row) => row.answered_at === input.cursor,
    );
    if (cursorIndex >= 0) {
      pageRows = descOrdered.slice(cursorIndex + 1);
    } else {
      pageRows = descOrdered.filter(
        (row) => row.answered_at < (input.cursor as string),
      );
    }
  }
  const sliced = pageRows.slice(0, pageSize);
  const nextCursor =
    sliced.length === pageSize && pageRows.length > pageSize
      ? sliced[sliced.length - 1].answered_at
      : null;

  const rows: StudentAttemptRow[] = sliced.map((row) => {
    const preview = input.previews.get(row.question_id) ?? null;
    const selectedOption = preview?.options.find(
      (option) => option.id === row.selected_option_id,
    );
    return {
      attemptId: row.id,
      questionId: row.question_id,
      questionStem: preview ? truncateStem(preview.text) : "Preview unavailable",
      selectedOptionId: row.selected_option_id,
      selectedOptionText: selectedOption?.text ?? row.selected_option_id,
      isCorrect: Boolean(row.is_correct),
      correctOptionId: preview?.correctOptionId ?? "",
      timeSpentSec:
        typeof row.time_spent_sec === "number" &&
        Number.isFinite(row.time_spent_sec)
          ? row.time_spent_sec
          : null,
      mode: coerceMode(row.mode),
      assignmentId: row.assignment_id,
      assignmentLabel: row.assignment_id
        ? (input.assignmentLabels.get(row.assignment_id) ?? "Assignment")
        : "Self-practice",
      standardId: row.standard_id,
      standardLabel: row.standard_label,
      answeredAt: row.answered_at,
    };
  });

  // Filter options come from the whole deduped history, not just the
  // current page, so toggling a filter cannot orphan the chart.
  const assignmentSet = new Map<string, string>();
  const standardSet = new Map<string, string>();
  for (const row of deduped) {
    if (row.assignment_id) {
      assignmentSet.set(
        row.assignment_id,
        input.assignmentLabels.get(row.assignment_id) ?? "Assignment",
      );
    }
    if (row.standard_id) {
      standardSet.set(
        row.standard_id,
        row.standard_label ?? row.standard_id,
      );
    }
  }

  const totalAttempts = deduped.length;
  const totalCorrect = deduped.reduce(
    (sum, row) => sum + (row.is_correct ? 1 : 0),
    0,
  );
  const times = deduped
    .map((row) =>
      typeof row.time_spent_sec === "number" &&
      Number.isFinite(row.time_spent_sec)
        ? row.time_spent_sec
        : null,
    )
    .filter((value): value is number => value !== null);

  const accuracy = safeRatio(totalCorrect, totalAttempts);

  return {
    student: input.student,
    summary: {
      totalAttempts,
      totalCorrect,
      accuracy,
      averageTimeSec: safeAverage(times),
      status: classifyStudent(accuracy, totalAttempts),
    },
    filters: {
      assignments: Array.from(assignmentSet.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      standards: Array.from(standardSet.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    },
    chart,
    answers: {
      rows,
      nextCursor,
    },
  };
}
