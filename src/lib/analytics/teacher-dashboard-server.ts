import { getStandardById } from "@/lib/standards";

export type AttemptMode = "practice" | "exam" | "review";

export interface AttemptRecord {
  userId: string;
  standardId: string | null;
  standardLabel: string | null;
  topic: string | null;
  mode: AttemptMode;
  isCorrect: boolean;
  timeSpentSec: number;
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

const LOW_AND_FAST_ACCURACY = 50;
const LOW_AND_FAST_AVG_TIME = 30;

function classifyStudent(accuracy: number, attempted: number): StudentStatus {
  if (attempted === 0) return "not_started";
  if (accuracy >= 70) return "on_track";
  if (accuracy >= 50) return "watch";
  return "struggling";
}

function classifyStandard(
  accuracy: number,
  attempted: number,
): StandardStatus {
  if (attempted === 0) return "not_started";
  if (accuracy >= 70) return "on_track";
  if (accuracy >= 55) return "watch";
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
  const totalTime = scopedAttempts.reduce(
    (sum, row) => sum + (Number.isFinite(row.timeSpentSec) ? row.timeSpentSec : 0),
    0,
  );
  const avgTimeSec =
    totalAnswered > 0 ? Math.round(totalTime / totalAnswered) : 0;

  // Per-mode totals for the summary
  const summaryModeAgg = emptyModeBreakdown();
  const summaryModeTotalTime: Record<AttemptMode, number> = {
    practice: 0,
    exam: 0,
    review: 0,
  };
  for (const row of scopedAttempts) {
    const mode = row.mode;
    summaryModeAgg[mode].attempted += 1;
    if (row.isCorrect) summaryModeAgg[mode].correct += 1;
    summaryModeTotalTime[mode] += row.timeSpentSec ?? 0;
  }
  for (const mode of MODES) {
    const agg = summaryModeAgg[mode];
    agg.accuracy =
      agg.attempted > 0 ? roundPercent((agg.correct / agg.attempted) * 100) : 0;
    agg.averageTimeSec =
      agg.attempted > 0
        ? Math.round(summaryModeTotalTime[mode] / agg.attempted)
        : 0;
  }

  // Standards aggregation (overall + per-mode)
  interface StandardAgg {
    label: string;
    attempted: number;
    correct: number;
    totalTime: number;
    byMode: Record<AttemptMode, ModeMetrics>;
    byModeTotalTime: Record<AttemptMode, number>;
  }
  const standardAgg = new Map<string, StandardAgg>();
  for (const row of scopedAttempts) {
    const standardId = row.standardId || "BIO.OTHER";
    const canonical = getStandardById(standardId);
    const standardLabel =
      canonical?.label || row.standardLabel || row.topic || "Other";
    const existing =
      standardAgg.get(standardId) ??
      ({
        label: standardLabel,
        attempted: 0,
        correct: 0,
        totalTime: 0,
        byMode: emptyModeBreakdown(),
        byModeTotalTime: { practice: 0, exam: 0, review: 0 },
      } satisfies StandardAgg);
    // Ensure canonical label wins even if the first seen row had a stale value
    if (canonical?.label) {
      existing.label = canonical.label;
    }
    existing.attempted += 1;
    if (row.isCorrect) existing.correct += 1;
    existing.totalTime += row.timeSpentSec ?? 0;
    const modeAgg = existing.byMode[row.mode];
    modeAgg.attempted += 1;
    if (row.isCorrect) modeAgg.correct += 1;
    existing.byModeTotalTime[row.mode] += row.timeSpentSec ?? 0;
    standardAgg.set(standardId, existing);
  }

  const byStandard: StandardRow[] = Array.from(standardAgg.entries())
    .map(([standardId, item]) => {
      const accuracy =
        item.attempted > 0
          ? roundPercent((item.correct / item.attempted) * 100)
          : 0;
      const averageTimeSec =
        item.attempted > 0 ? Math.round(item.totalTime / item.attempted) : 0;

      const byMode: Record<AttemptMode, ModeMetrics> = emptyModeBreakdown();
      for (const mode of MODES) {
        const m = item.byMode[mode];
        byMode[mode] = {
          attempted: m.attempted,
          correct: m.correct,
          accuracy:
            m.attempted > 0
              ? roundPercent((m.correct / m.attempted) * 100)
              : 0,
          averageTimeSec:
            m.attempted > 0
              ? Math.round(item.byModeTotalTime[mode] / m.attempted)
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
    { attempted: number; correct: number; totalTime: number }
  >();
  for (const row of scopedAttempts) {
    const existing = studentAgg.get(row.userId) ?? {
      attempted: 0,
      correct: 0,
      totalTime: 0,
    };
    existing.attempted += 1;
    if (row.isCorrect) existing.correct += 1;
    existing.totalTime += row.timeSpentSec ?? 0;
    studentAgg.set(row.userId, existing);
  }

  const byStudent: StudentRow[] = visibleStudents
    .map((student) => {
      const agg = studentAgg.get(student.id) ?? {
        attempted: 0,
        correct: 0,
        totalTime: 0,
      };
      const accuracy =
        agg.attempted > 0
          ? roundPercent((agg.correct / agg.attempted) * 100)
          : 0;
      const averageTimeSec =
        agg.attempted > 0 ? Math.round(agg.totalTime / agg.attempted) : 0;
      const status = classifyStudent(accuracy, agg.attempted);
      const isLowAndFast =
        agg.attempted >= 10 &&
        accuracy < LOW_AND_FAST_ACCURACY &&
        averageTimeSec > 0 &&
        averageTimeSec < LOW_AND_FAST_AVG_TIME;
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
