import { getStandardById } from "@/lib/standards";
import {
  LOW_AND_FAST_MAX_ACCURACY,
  LOW_AND_FAST_MAX_AVG_TIME_SEC,
  LOW_AND_FAST_MIN_ATTEMPTS,
  STANDARD_ON_TRACK_MIN_ACCURACY,
  STANDARD_WATCH_MIN_ACCURACY,
  STUDENT_ON_TRACK_MIN_ACCURACY,
  STUDENT_WATCH_MIN_ACCURACY,
} from "@/lib/analytics/constants";

export type AttemptMode = "practice" | "exam" | "review";

export interface AttemptRecord {
  userId: string;
  standardId: string | null;
  standardLabel: string | null;
  topic: string | null;
  mode: AttemptMode;
  isCorrect: boolean;
  /** Measured dwell time in seconds. `null` means not recorded (legacy rows); exclude from time averages. */
  timeSpentSec: number | null;
  assignmentId: string | null;
}

export type StudentStatus =
  | "on_track"
  | "watch"
  | "struggling"
  | "not_started";

export type StandardStatus = "on_track" | "watch" | "needs_review" | "not_started";

export interface ModeMetrics {
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
}

export interface StandardRow {
  standardId: string;
  standardLabel: string;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
  status: StandardStatus;
  byMode?: Record<AttemptMode, ModeMetrics>;
}

export interface StudentRow {
  studentId: string;
  label: string;
  classId: string | null;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
  status: StudentStatus;
  isLowAndFast: boolean;
}

export interface DashboardSummary {
  completionRate: number;
  studentsAttempted: number;
  studentsTotal: number;
  overallAccuracy: number;
  avgTimeSec: number;
  totalAnswered: number;
  totalCorrect: number;
  breakdown: {
    onTrack: number;
    watch: number;
    struggling: number;
    notStarted: number;
  };
  byMode?: Record<AttemptMode, ModeMetrics>;
}

export interface DashboardResponseBody {
  students: { id: string; label: string; classId: string | null }[];
  topics: string[];
  summary: DashboardSummary;
  byStandard: StandardRow[];
  byStudent: StudentRow[];
  lowAndFastCount: number;
}

function classifyStudent(accuracy: number, attempted: number): StudentStatus {
  if (attempted === 0) return "not_started";
  if (accuracy >= STUDENT_ON_TRACK_MIN_ACCURACY) return "on_track";
  if (accuracy >= STUDENT_WATCH_MIN_ACCURACY) return "watch";
  return "struggling";
}

function classifyStandard(
  accuracy: number,
  attempted: number,
): StandardStatus {
  if (attempted === 0) return "not_started";
  if (accuracy >= STANDARD_ON_TRACK_MIN_ACCURACY) return "on_track";
  if (accuracy >= STANDARD_WATCH_MIN_ACCURACY) return "watch";
  return "needs_review";
}

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)));
}

interface BuildArgs {
  attempts: AttemptRecord[];
  topic?: string;
  scopedStudents: { id: string; label: string; classId: string | null }[];
  selectedStudentId: string | null;
  includeModeBreakdown?: boolean;
}

const MODES: AttemptMode[] = ["practice", "exam", "review"];

function emptyModeMetrics(): ModeMetrics {
  return { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 };
}

function emptyModeBreakdown(): Record<AttemptMode, ModeMetrics> {
  return {
    practice: emptyModeMetrics(),
    exam: emptyModeMetrics(),
    review: emptyModeMetrics(),
  };
}

export function buildDashboardResponse(args: BuildArgs): DashboardResponseBody {
  const {
    attempts,
    topic,
    scopedStudents,
    selectedStudentId,
    includeModeBreakdown = false,
  } = args;

  const topics = Array.from(
    new Set(
      attempts
        .map((row) => (row.topic ?? "").trim())
        .filter((value): value is string => value.length > 0),
    ),
  ).sort();

  const filteredByTopic = topic
    ? attempts.filter((row) => (row.topic ?? "").trim() === topic)
    : attempts;

  const visibleStudents = selectedStudentId
    ? scopedStudents.filter((student) => student.id === selectedStudentId)
    : scopedStudents;

  const visibleStudentIds = new Set(visibleStudents.map((s) => s.id));
  const scopedAttempts = filteredByTopic.filter((row) =>
    visibleStudentIds.has(row.userId),
  );

  const totalAnswered = scopedAttempts.length;
  const totalCorrect = scopedAttempts.filter((row) => row.isCorrect).length;
  const overallAccuracy =
    totalAnswered > 0
      ? roundPercent((totalCorrect / totalAnswered) * 100)
      : 0;
  let measuredTimeTotal = 0;
  let measuredTimeCount = 0;
  for (const row of scopedAttempts) {
    if (row.timeSpentSec !== null && Number.isFinite(row.timeSpentSec)) {
      measuredTimeTotal += row.timeSpentSec;
      measuredTimeCount += 1;
    }
  }
  const avgTimeSec =
    measuredTimeCount > 0 ? Math.round(measuredTimeTotal / measuredTimeCount) : 0;

  // Per-mode totals for the summary
  const summaryModeAgg = emptyModeBreakdown();
  const summaryModeTotalTime: Record<AttemptMode, number> = {
    practice: 0,
    exam: 0,
    review: 0,
  };
  const summaryModeMeasuredCount: Record<AttemptMode, number> = {
    practice: 0,
    exam: 0,
    review: 0,
  };
  for (const row of scopedAttempts) {
    const mode = row.mode;
    summaryModeAgg[mode].attempted += 1;
    if (row.isCorrect) summaryModeAgg[mode].correct += 1;
    if (row.timeSpentSec !== null && Number.isFinite(row.timeSpentSec)) {
      summaryModeTotalTime[mode] += row.timeSpentSec;
      summaryModeMeasuredCount[mode] += 1;
    }
  }
  for (const mode of MODES) {
    const agg = summaryModeAgg[mode];
    agg.accuracy =
      agg.attempted > 0 ? roundPercent((agg.correct / agg.attempted) * 100) : 0;
    const mc = summaryModeMeasuredCount[mode];
    agg.averageTimeSec =
      mc > 0 ? Math.round(summaryModeTotalTime[mode] / mc) : 0;
  }

  // Standards aggregation (overall + per-mode)
  interface StandardAgg {
    label: string;
    attempted: number;
    correct: number;
    totalTime: number;
    measuredTimeCount: number;
    byMode: Record<AttemptMode, ModeMetrics>;
    byModeTotalTime: Record<AttemptMode, number>;
    byModeMeasuredCount: Record<AttemptMode, number>;
  }
  const standardAgg = new Map<string, StandardAgg>();
  // Stable id used when DB row has no standardId. We namespace by topic so
  // attempts from unrelated topics don't get merged under a single catch-all
  // bucket (which would mislabel them with whichever row was seen first).
  const UNKNOWN_STANDARD_PREFIX = "BIO.OTHER";
  for (const row of scopedAttempts) {
    let aggKey: string;
    let fallbackLabel: string;
    if (row.standardId) {
      aggKey = row.standardId;
      fallbackLabel = row.standardLabel || row.topic || "Other";
    } else {
      const topicSlug = (row.topic ?? "").trim();
      aggKey = topicSlug
        ? `${UNKNOWN_STANDARD_PREFIX}::${topicSlug}`
        : UNKNOWN_STANDARD_PREFIX;
      fallbackLabel = row.standardLabel || topicSlug || "Other";
    }
    const canonical = row.standardId ? getStandardById(row.standardId) : undefined;
    const standardLabel = canonical?.label || fallbackLabel;
    const existing =
      standardAgg.get(aggKey) ??
      ({
        label: standardLabel,
        attempted: 0,
        correct: 0,
        totalTime: 0,
        measuredTimeCount: 0,
        byMode: emptyModeBreakdown(),
        byModeTotalTime: { practice: 0, exam: 0, review: 0 },
        byModeMeasuredCount: { practice: 0, exam: 0, review: 0 },
      } satisfies StandardAgg);
    // Ensure canonical label wins even if the first seen row had a stale value
    if (canonical?.label) {
      existing.label = canonical.label;
    }
    existing.attempted += 1;
    if (row.isCorrect) existing.correct += 1;
    if (row.timeSpentSec !== null && Number.isFinite(row.timeSpentSec)) {
      existing.totalTime += row.timeSpentSec;
      existing.measuredTimeCount += 1;
    }
    const modeAgg = existing.byMode[row.mode];
    modeAgg.attempted += 1;
    if (row.isCorrect) modeAgg.correct += 1;
    if (row.timeSpentSec !== null && Number.isFinite(row.timeSpentSec)) {
      existing.byModeTotalTime[row.mode] += row.timeSpentSec;
      existing.byModeMeasuredCount[row.mode] += 1;
    }
    standardAgg.set(aggKey, existing);
  }

  const byStandard: StandardRow[] = Array.from(standardAgg.entries())
    .map(([standardId, item]) => {
      const accuracy =
        item.attempted > 0
          ? roundPercent((item.correct / item.attempted) * 100)
          : 0;
      const averageTimeSec =
        item.measuredTimeCount > 0
          ? Math.round(item.totalTime / item.measuredTimeCount)
          : 0;

      const byMode: Record<AttemptMode, ModeMetrics> = emptyModeBreakdown();
      for (const mode of MODES) {
        const m = item.byMode[mode];
        const modeMeasured = item.byModeMeasuredCount[mode];
        byMode[mode] = {
          attempted: m.attempted,
          correct: m.correct,
          accuracy:
            m.attempted > 0
              ? roundPercent((m.correct / m.attempted) * 100)
              : 0,
          averageTimeSec:
            modeMeasured > 0
              ? Math.round(item.byModeTotalTime[mode] / modeMeasured)
              : 0,
        };
      }

      const row: StandardRow = {
        standardId,
        standardLabel: item.label,
        attempted: item.attempted,
        correct: item.correct,
        accuracy,
        averageTimeSec,
        status: classifyStandard(accuracy, item.attempted),
      };
      if (includeModeBreakdown) {
        row.byMode = byMode;
      }
      return row;
    })
    .sort((a, b) => a.standardId.localeCompare(b.standardId));

  // Student aggregation — always emit a row per scoped student so the teacher sees non-starters too.
  const studentAgg = new Map<
    string,
    { attempted: number; correct: number; totalTime: number; measuredTimeCount: number }
  >();
  for (const row of scopedAttempts) {
    const existing = studentAgg.get(row.userId) ?? {
      attempted: 0,
      correct: 0,
      totalTime: 0,
      measuredTimeCount: 0,
    };
    existing.attempted += 1;
    if (row.isCorrect) existing.correct += 1;
    if (row.timeSpentSec !== null && Number.isFinite(row.timeSpentSec)) {
      existing.totalTime += row.timeSpentSec;
      existing.measuredTimeCount += 1;
    }
    studentAgg.set(row.userId, existing);
  }

  const byStudent: StudentRow[] = visibleStudents
    .map((student) => {
      const agg = studentAgg.get(student.id) ?? {
        attempted: 0,
        correct: 0,
        totalTime: 0,
        measuredTimeCount: 0,
      };
      const accuracy =
        agg.attempted > 0
          ? roundPercent((agg.correct / agg.attempted) * 100)
          : 0;
      const averageTimeSec =
        agg.measuredTimeCount > 0
          ? Math.round(agg.totalTime / agg.measuredTimeCount)
          : 0;
      const status = classifyStudent(accuracy, agg.attempted);
      const isLowAndFast =
        agg.attempted >= LOW_AND_FAST_MIN_ATTEMPTS &&
        accuracy < LOW_AND_FAST_MAX_ACCURACY &&
        averageTimeSec > 0 &&
        averageTimeSec < LOW_AND_FAST_MAX_AVG_TIME_SEC;
      return {
        studentId: student.id,
        label: student.label,
        classId: student.classId,
        attempted: agg.attempted,
        correct: agg.correct,
        accuracy,
        averageTimeSec,
        status,
        isLowAndFast,
      } satisfies StudentRow;
    })
    .sort((a, b) => {
      const statusOrder: Record<StudentStatus, number> = {
        struggling: 0,
        watch: 1,
        on_track: 2,
        not_started: 3,
      };
      const aOrder = statusOrder[a.status];
      const bOrder = statusOrder[b.status];
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.label.localeCompare(b.label);
    });

  const studentsTotal = visibleStudents.length;
  const studentsAttempted = byStudent.filter((row) => row.attempted > 0).length;
  const completionRate =
    studentsTotal > 0
      ? roundPercent((studentsAttempted / studentsTotal) * 100)
      : 0;

  const breakdown = byStudent.reduce(
    (acc, row) => {
      if (row.status === "on_track") acc.onTrack += 1;
      else if (row.status === "watch") acc.watch += 1;
      else if (row.status === "struggling") acc.struggling += 1;
      else acc.notStarted += 1;
      return acc;
    },
    { onTrack: 0, watch: 0, struggling: 0, notStarted: 0 },
  );

  const lowAndFastCount = byStudent.filter((row) => row.isLowAndFast).length;

  const summary: DashboardSummary = {
    completionRate,
    studentsAttempted,
    studentsTotal,
    overallAccuracy,
    avgTimeSec,
    totalAnswered,
    totalCorrect,
    breakdown,
  };
  if (includeModeBreakdown) {
    summary.byMode = summaryModeAgg;
  }

  return {
    students: scopedStudents,
    topics,
    summary,
    byStandard,
    byStudent,
    lowAndFastCount,
  };
}
