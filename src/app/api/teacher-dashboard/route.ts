import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildDashboardResponse,
  type AttemptMode,
  type AttemptRecord,
} from "@/lib/analytics/teacher-dashboard-server";
import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";
import { loadTeacherThresholds } from "@/lib/analytics/teacher-thresholds";
import { DEFAULT_PERFORMANCE_THRESHOLDS } from "@/lib/analytics/constants";
import { resolveTeacherRoster } from "@/lib/analytics/teacher-roster";

/**
 * Raw shape returned by Supabase for the `attempts` table.
 *
 * Differs from `AttemptRecord` (domain model used by the aggregation layer)
 * in a few ways:
 *  - fields are snake_case to match SQL column names
 *  - `mode` is `string | null` because the column is untyped TEXT in the DB
 *    (no CHECK constraint) — we coerce to the `AttemptMode` enum below
 *  - `time_spent_sec` can be NULL for legacy rows
 *  - `answered_at` is selected so assignment-exam rows can be deduped to the
 *    latest final answer per question before aggregation.
 */
interface AttemptQueryRow {
  user_id: string;
  question_id: string;
  standard_id: string | null;
  standard_label: string | null;
  topic: string | null;
  mode: string | null;
  is_correct: boolean;
  time_spent_sec: number | null;
  assignment_id: string | null;
  answered_at: string;
}

const ATTEMPT_MODES = ["practice", "exam", "review"] as const satisfies readonly AttemptMode[];

/**
 * Coerce a raw `mode` string from the DB into a valid `AttemptMode`.
 * Falls back to "practice" when the value is missing or not recognized —
 * this preserves legacy rows and avoids runtime type lies when the DB
 * contains unexpected values (the column has no CHECK constraint).
 */
function coerceAttemptMode(raw: string | null): AttemptMode {
  return ATTEMPT_MODES.find((m) => m === raw) ?? "practice";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId") || undefined;
  const classId = url.searchParams.get("classId") || undefined;
  const topic = url.searchParams.get("topic") || undefined;
  const range = parseEnum<RangeKey>(
    url.searchParams.get("range"),
    ["7d", "30d", "all"] as const,
    "30d",
  );
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

  const { classes, scopedStudents } = await resolveTeacherRoster(admin, user.id, role);

  const { thresholds, isCustom: thresholdsAreCustom } = await loadTeacherThresholds(user.id);

  const emptyResponse = {
    classes,
    students: [] as { id: string; label: string; classId: string | null }[],
    topics: [] as string[],
    summary: {
      completionRate: 0,
      studentsAttempted: 0,
      studentsTotal: 0,
      overallAccuracy: 0,
      avgTimeSec: 0,
      totalAnswered: 0,
      totalCorrect: 0,
      breakdown: {
        advanced: 0,
        proficient: 0,
        basic: 0,
        belowBasic: 0,
        notStarted: 0,
      },
    },
    byStandard: [] as never[],
    byStudent: [] as never[],
    lowAndFastCount: 0,
    thresholds,
    defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
    thresholdsAreCustom,
    filters: { range, mode, source, classId: classId ?? null, studentId: studentId ?? null, topic: topic ?? null },
  };

  if (scopedStudents.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  const effectiveStudents =
    classId && classes.some((c) => c.id === classId)
      ? scopedStudents.filter((student) => student.classId === classId)
      : scopedStudents;

  if (effectiveStudents.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  const studentMap = new Map(effectiveStudents.map((s) => [s.id, s.label]));
  const studentClassMap = new Map(effectiveStudents.map((s) => [s.id, s.classId]));
  const filteredStudentIds = effectiveStudents.map((s) => s.id);
  const filteredEffectiveStudentIds =
    studentId && filteredStudentIds.includes(studentId)
      ? [studentId]
      : filteredStudentIds;

  let attemptsQuery = admin
    .from("attempts")
    .select(
      "user_id,question_id,standard_id,standard_label,topic,mode,is_correct,time_spent_sec,assignment_id,answered_at",
    )
    .in("user_id", filteredEffectiveStudentIds);
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
    console.error("[teacher-dashboard] attempts query failed", attemptsError);
    return NextResponse.json(
      { error: "Failed to load attempts data" },
      { status: 500 },
    );
  }
  const dedupedAttemptRows = dedupeAssignmentExamAttempts(
    (attemptsData ?? []) as AttemptQueryRow[],
  );
  const attempts = dedupedAttemptRows.map<AttemptRecord>(
    (row) => ({
      userId: String(row.user_id),
      standardId: row.standard_id,
      standardLabel: row.standard_label,
      topic: row.topic,
      mode: coerceAttemptMode(row.mode),
      isCorrect: Boolean(row.is_correct),
      timeSpentSec:
        typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)
          ? row.time_spent_sec
          : null,
      assignmentId: row.assignment_id,
    }),
  );

  const payload = buildDashboardResponse({
    attempts,
    topic,
    scopedStudents: filteredStudentIds.map((id) => ({
      id,
      label: studentMap.get(id) ?? id,
      classId: studentClassMap.get(id) ?? null,
    })),
    selectedStudentId: studentId ?? null,
    includeModeBreakdown: mode === "compare",
    thresholds,
  });

  return NextResponse.json({
    classes,
    ...payload,
    defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
    thresholdsAreCustom,
    filters: { range, mode, source, classId: classId ?? null, studentId: studentId ?? null, topic: topic ?? null },
  });
}
