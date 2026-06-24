import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveTeacherRoster,
  TeacherRosterLookupError,
} from "@/lib/analytics/teacher-roster";
import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";
import {
  classifyPerformance,
  roundPercent,
  type AttemptMode,
  type StandardStatus,
  type StudentStatus,
  type ModeMetrics,
} from "@/lib/analytics/teacher-dashboard-server";
import { loadTeacherThresholds } from "@/lib/analytics/teacher-thresholds";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  LOW_AND_FAST_MAX_ACCURACY,
  LOW_AND_FAST_MAX_AVG_TIME_SEC,
  LOW_AND_FAST_MIN_ATTEMPTS,
  type PerformanceThresholds,
} from "@/lib/analytics/constants";
import { fetchQuestionPreviews, type QuestionPreview } from "@/lib/analytics/question-preview";
import { getStandardById } from "@/lib/standards";

interface AttemptQueryRow {
  user_id: string;
  question_id: string;
  standard_id: string | null;
  standard_label: string | null;
  mode: string | null;
  is_correct: boolean;
  time_spent_sec: number | null;
  assignment_id: string | null;
  answered_at: string;
}

const ATTEMPT_MODES = ["practice", "exam", "review"] as const satisfies readonly AttemptMode[];

function coerceAttemptMode(raw: string | null): AttemptMode {
  return ATTEMPT_MODES.find((m) => m === raw) ?? "practice";
}

function emptyModeMetrics(): ModeMetrics {
  return { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0, studentsAttempted: 0 };
}

type RangeKey = "7d" | "30d" | "all";
type ModeFilter = "practice" | "exam" | "review" | "compare" | "all";
type SourceFilter = "assigned" | "self" | "all";

function parseEnum<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((value) => value === raw) ?? fallback;
}

export interface AccuracyOverTimePoint {
  date: string;
  accuracy: number;
  attempted: number;
}

export interface StudentDetailStandardRow {
  standardId: string;
  standardLabel: string;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
  status: StandardStatus;
}

export interface StudentDetailQuestionRow {
  questionId: string;
  standardId: string | null;
  preview: QuestionPreview | null;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
  lastAttemptedAt: string;
}

export interface StudentDetailResponse {
  student: { id: string; label: string; classId: string | null } | null;
  summary: {
    attempted: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
    status: StudentStatus;
    isLowAndFast: boolean;
  };
  byMode: Record<AttemptMode, ModeMetrics>;
  accuracyOverTime: AccuracyOverTimePoint[];
  byStandard: StudentDetailStandardRow[];
  byQuestion: StudentDetailQuestionRow[];
  thresholds: PerformanceThresholds;
  defaults: PerformanceThresholds;
  thresholdsAreCustom: boolean;
  filters: {
    range: RangeKey;
    mode: ModeFilter;
    source: SourceFilter;
    classId: string | null;
  };
}

const ACCURACY_OVER_TIME_MAX_POINTS = 12;

function buildAccuracyOverTime(
  attempts: { isCorrect: boolean; answeredAt: string }[],
): AccuracyOverTimePoint[] {
  const sorted = [...attempts].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  const byDay = new Map<string, { attempted: number; correct: number }>();
  for (const row of sorted) {
    const day = row.answeredAt.slice(0, 10);
    const bucket = byDay.get(day) ?? { attempted: 0, correct: 0 };
    bucket.attempted += 1;
    if (row.isCorrect) bucket.correct += 1;
    byDay.set(day, bucket);
  }

  const days = Array.from(byDay.keys()).sort();
  let cumAttempted = 0;
  let cumCorrect = 0;
  const points: AccuracyOverTimePoint[] = days.map((day) => {
    const bucket = byDay.get(day)!;
    cumAttempted += bucket.attempted;
    cumCorrect += bucket.correct;
    return {
      date: day,
      accuracy: roundPercent((cumCorrect / cumAttempted) * 100),
      attempted: cumAttempted,
    };
  });

  if (points.length <= ACCURACY_OVER_TIME_MAX_POINTS) return points;

  const step = points.length / ACCURACY_OVER_TIME_MAX_POINTS;
  const sampled: AccuracyOverTimePoint[] = [];
  for (let i = 0; i < ACCURACY_OVER_TIME_MAX_POINTS; i += 1) {
    const idx = Math.min(points.length - 1, Math.floor(i * step));
    sampled.push(points[idx]);
  }
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled[sampled.length - 1] = points[points.length - 1];
  }
  return sampled;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ studentId: string }> },
) {
  const { studentId: rawStudentId } = await context.params;
  const studentId = decodeURIComponent(rawStudentId);

  const url = new URL(request.url);
  const classId = url.searchParams.get("classId") || undefined;
  const range = parseEnum<RangeKey>(url.searchParams.get("range"), ["7d", "30d", "all"] as const, "30d");
  const mode = parseEnum<ModeFilter>(
    url.searchParams.get("mode"),
    ["practice", "exam", "review", "compare", "all"] as const,
    "compare",
  );
  const source = parseEnum<SourceFilter>(
    url.searchParams.get("source"),
    ["assigned", "self", "all"] as const,
    "all",
  );

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, currentProfile?.role);
  if (role !== "teacher" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { thresholds, isCustom: thresholdsAreCustom } = await loadTeacherThresholds(user.id);
  const filters = {
    range,
    mode,
    source,
    classId: classId ?? null,
  };

  let roster;
  try {
    roster = await resolveTeacherRoster(admin, user.id, role);
  } catch (error) {
    if (error instanceof TeacherRosterLookupError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }
  const student = roster.scopedStudents.find(
    (s) => s.id === studentId && (!classId || s.classIds.includes(classId)),
  );
  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const emptyResponse: StudentDetailResponse = {
    student: { id: student.id, label: student.label, classId: student.classId },
    summary: {
      attempted: 0,
      correct: 0,
      accuracy: 0,
      averageTimeSec: 0,
      status: "not_started",
      isLowAndFast: false,
    },
    byMode: { practice: emptyModeMetrics(), exam: emptyModeMetrics(), review: emptyModeMetrics() },
    accuracyOverTime: [],
    byStandard: [],
    byQuestion: [],
    thresholds,
    defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
    thresholdsAreCustom,
    filters,
  };

  let attemptsQuery = admin
    .from("attempts")
    .select("user_id,question_id,standard_id,standard_label,mode,is_correct,time_spent_sec,assignment_id,answered_at")
    .eq("user_id", studentId);
  if (range !== "all") {
    const days = range === "7d" ? 7 : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    attemptsQuery = attemptsQuery.gte("answered_at", from.toISOString());
  }
  if (mode !== "all" && mode !== "compare") {
    attemptsQuery = attemptsQuery.eq("mode", mode);
  }
  if (source === "assigned") {
    attemptsQuery = attemptsQuery.not("assignment_id", "is", null);
  } else if (source === "self") {
    attemptsQuery = attemptsQuery.is("assignment_id", null);
  }

  const { data: attemptsData, error: attemptsError } = await attemptsQuery;
  if (attemptsError) {
    console.error("[teacher/students] attempts query failed", attemptsError);
    return NextResponse.json({ error: "Failed to load attempts data" }, { status: 500 });
  }

  const attempts = dedupeAssignmentExamAttempts((attemptsData ?? []) as AttemptQueryRow[]);
  if (attempts.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  let overallCorrect = 0;
  let overallTimeTotal = 0;
  let overallTimeCount = 0;

  const byModeAgg: Record<AttemptMode, ModeMetrics> = {
    practice: emptyModeMetrics(),
    exam: emptyModeMetrics(),
    review: emptyModeMetrics(),
  };
  const byModeTime: Record<AttemptMode, { total: number; count: number }> = {
    practice: { total: 0, count: 0 },
    exam: { total: 0, count: 0 },
    review: { total: 0, count: 0 },
  };

  interface StandardAgg {
    label: string;
    attempted: number;
    correct: number;
    timeTotal: number;
    timeCount: number;
  }
  const standardAgg = new Map<string, StandardAgg>();

  interface QuestionAgg {
    standardId: string | null;
    attempted: number;
    correct: number;
    timeTotal: number;
    timeCount: number;
    lastAttemptedAt: string;
  }
  const questionAgg = new Map<string, QuestionAgg>();

  const accuracyOverTimeInput: { isCorrect: boolean; answeredAt: string }[] = [];

  for (const row of attempts) {
    const attemptMode = coerceAttemptMode(row.mode);
    if (row.is_correct) overallCorrect += 1;
    const hasTime = typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec);
    if (hasTime) {
      overallTimeTotal += row.time_spent_sec as number;
      overallTimeCount += 1;
    }

    const modeMetrics = byModeAgg[attemptMode];
    modeMetrics.attempted += 1;
    if (row.is_correct) modeMetrics.correct += 1;
    if (hasTime) {
      byModeTime[attemptMode].total += row.time_spent_sec as number;
      byModeTime[attemptMode].count += 1;
    }

    accuracyOverTimeInput.push({ isCorrect: row.is_correct, answeredAt: row.answered_at });

    if (row.standard_id) {
      const canonical = getStandardById(row.standard_id);
      const sAgg =
        standardAgg.get(row.standard_id) ??
        ({
          label: canonical?.label || row.standard_label || row.standard_id,
          attempted: 0,
          correct: 0,
          timeTotal: 0,
          timeCount: 0,
        } satisfies StandardAgg);
      if (canonical?.label) sAgg.label = canonical.label;
      sAgg.attempted += 1;
      if (row.is_correct) sAgg.correct += 1;
      if (hasTime) {
        sAgg.timeTotal += row.time_spent_sec as number;
        sAgg.timeCount += 1;
      }
      standardAgg.set(row.standard_id, sAgg);
    }

    const qAgg =
      questionAgg.get(row.question_id) ??
      ({
        standardId: row.standard_id,
        attempted: 0,
        correct: 0,
        timeTotal: 0,
        timeCount: 0,
        lastAttemptedAt: row.answered_at,
      } satisfies QuestionAgg);
    qAgg.attempted += 1;
    if (row.is_correct) qAgg.correct += 1;
    if (hasTime) {
      qAgg.timeTotal += row.time_spent_sec as number;
      qAgg.timeCount += 1;
    }
    if (row.answered_at > qAgg.lastAttemptedAt) qAgg.lastAttemptedAt = row.answered_at;
    questionAgg.set(row.question_id, qAgg);
  }

  for (const m of ATTEMPT_MODES) {
    const metrics = byModeAgg[m];
    metrics.accuracy = metrics.attempted > 0 ? roundPercent((metrics.correct / metrics.attempted) * 100) : 0;
    const time = byModeTime[m];
    metrics.averageTimeSec = time.count > 0 ? Math.round(time.total / time.count) : 0;
    metrics.studentsAttempted = metrics.attempted > 0 ? 1 : 0;
  }

  const totalAttempted = attempts.length;
  const overallAccuracy = totalAttempted > 0 ? roundPercent((overallCorrect / totalAttempted) * 100) : 0;
  const overallAverageTimeSec = overallTimeCount > 0 ? Math.round(overallTimeTotal / overallTimeCount) : 0;
  const status = classifyPerformance(overallAccuracy, totalAttempted, thresholds);
  const isLowAndFast =
    totalAttempted >= LOW_AND_FAST_MIN_ATTEMPTS &&
    overallAccuracy < LOW_AND_FAST_MAX_ACCURACY &&
    overallAverageTimeSec > 0 &&
    overallAverageTimeSec < LOW_AND_FAST_MAX_AVG_TIME_SEC;

  const byStandard: StudentDetailStandardRow[] = Array.from(standardAgg.entries())
    .map(([standardId, agg]) => {
      const accuracy = agg.attempted > 0 ? roundPercent((agg.correct / agg.attempted) * 100) : 0;
      const averageTimeSec = agg.timeCount > 0 ? Math.round(agg.timeTotal / agg.timeCount) : 0;
      return {
        standardId,
        standardLabel: agg.label,
        attempted: agg.attempted,
        correct: agg.correct,
        accuracy,
        averageTimeSec,
        status: classifyPerformance(accuracy, agg.attempted, thresholds),
      };
    })
    .sort((a, b) => a.standardId.localeCompare(b.standardId));

  const questionIds = Array.from(questionAgg.keys());
  const { data: previewByQuestionId, error: previewError } = await fetchQuestionPreviews(admin, questionIds);
  if (previewError) {
    return NextResponse.json({ error: previewError }, { status: 500 });
  }

  const byQuestion: StudentDetailQuestionRow[] = Array.from(questionAgg.entries())
    .map(([questionId, agg]) => {
      const accuracy = agg.attempted > 0 ? roundPercent((agg.correct / agg.attempted) * 100) : 0;
      const averageTimeSec = agg.timeCount > 0 ? Math.round(agg.timeTotal / agg.timeCount) : 0;
      return {
        questionId,
        standardId: agg.standardId,
        preview: previewByQuestionId.get(questionId) ?? null,
        attempted: agg.attempted,
        correct: agg.correct,
        accuracy,
        averageTimeSec,
        lastAttemptedAt: agg.lastAttemptedAt,
      };
    })
    .sort((a, b) => b.lastAttemptedAt.localeCompare(a.lastAttemptedAt));

  const response: StudentDetailResponse = {
    student: { id: student.id, label: student.label, classId: student.classId },
    summary: {
      attempted: totalAttempted,
      correct: overallCorrect,
      accuracy: overallAccuracy,
      averageTimeSec: overallAverageTimeSec,
      status,
      isLowAndFast,
    },
    byMode: byModeAgg,
    accuracyOverTime: buildAccuracyOverTime(accuracyOverTimeInput),
    byStandard,
    byQuestion,
    thresholds,
    defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
    thresholdsAreCustom,
    filters,
  };

  return NextResponse.json(response);
}
