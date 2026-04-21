import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildDashboardResponse,
  type AttemptMode,
  type AttemptRecord,
} from "@/lib/analytics/teacher-dashboard-server";

/**
 * Raw shape returned by Supabase for the `attempts` table.
 *
 * Differs from `AttemptRecord` (domain model used by the aggregation layer)
 * in a few ways:
 *  - fields are snake_case to match SQL column names
 *  - `mode` is `string | null` because the column is untyped TEXT in the DB
 *    (no CHECK constraint) — we coerce to the `AttemptMode` enum below
 *  - `time_spent_sec` can be NULL for legacy rows
 *  - `answered_at` is used only for server-side filtering (`.gte`) and is
 *    intentionally omitted from this type / SELECT (see attempts query)
 */
interface AttemptQueryRow {
  user_id: string;
  standard_id: string | null;
  standard_label: string | null;
  topic: string | null;
  mode: string | null;
  is_correct: boolean;
  time_spent_sec: number | null;
  assignment_id: string | null;
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
  if (!role || !["teacher", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let schoolIds: string[] = [];
  if (role === "teacher") {
    const [schoolTeachersRes, legacySchoolsRes] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", user.id),
      admin.from("schools").select("id").eq("teacher_user_id", user.id),
    ]);
    if (schoolTeachersRes.error) {
      console.error("[teacher-dashboard] school_teachers query failed", schoolTeachersRes.error);
    }
    if (legacySchoolsRes.error) {
      console.error("[teacher-dashboard] legacy schools query failed", legacySchoolsRes.error);
    }
    schoolIds = Array.from(
      new Set([
        ...(schoolTeachersRes.data ?? []).map((row) => row.school_id),
        ...(legacySchoolsRes.data ?? []).map((row) => row.id),
      ]),
    );
  } else {
    const { data: allSchools, error: allSchoolsError } = await admin
      .from("schools")
      .select("id")
      .order("name", { ascending: true });
    if (allSchoolsError) {
      console.error("[teacher-dashboard] schools query failed", allSchoolsError);
    }
    schoolIds = (allSchools ?? []).map((row) => row.id);
  }

  let schoolRows: { id: string; name: string }[] = [];
  if (schoolIds.length > 0) {
    const { data, error } = await admin
      .from("schools")
      .select("id,name")
      .in("id", schoolIds);
    if (error) {
      console.error("[teacher-dashboard] school name lookup failed", error);
    }
    schoolRows = data ?? [];
  }

  const classes = schoolRows
    .map((row) => ({ id: String(row.id), label: String(row.name ?? row.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

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
      breakdown: { onTrack: 0, watch: 0, struggling: 0, notStarted: 0 },
    },
    byStandard: [] as never[],
    byStudent: [] as never[],
    lowAndFastCount: 0,
    filters: { range, mode, source, classId: classId ?? null, studentId: studentId ?? null, topic: topic ?? null },
  };

  if (schoolIds.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  const effectiveClassIds =
    classId && schoolIds.includes(classId) ? [classId] : schoolIds;

  const { data: memberRows, error: memberError } = await admin
    .from("school_members")
    .select("school_id,student_user_id")
    .in("school_id", effectiveClassIds);
  if (memberError) {
    console.error("[teacher-dashboard] school_members query failed", memberError);
    return NextResponse.json(
      { error: "Failed to load class roster" },
      { status: 500 },
    );
  }

  const studentClassMap = new Map<string, string>();
  for (const row of memberRows ?? []) {
    const sid = String(row.student_user_id);
    if (!studentClassMap.has(sid)) {
      studentClassMap.set(sid, String(row.school_id));
    }
  }
  const scopedStudentIds = Array.from(studentClassMap.keys());

  if (scopedStudentIds.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  const effectiveStudentIds =
    studentId && scopedStudentIds.includes(studentId)
      ? [studentId]
      : scopedStudentIds;

  const { data: profileRows, error: profileError } = await admin
    .from("profiles")
    .select("id,display_name,student_id")
    .in("id", scopedStudentIds);
  if (profileError) {
    console.error("[teacher-dashboard] profiles query failed", profileError);
  }

  const studentMap = new Map<string, string>();
  for (const profile of profileRows ?? []) {
    studentMap.set(
      String(profile.id),
      String(profile.display_name || profile.student_id || profile.id),
    );
  }

  // Note: `answered_at` is used only for server-side date filtering (`.gte` below)
  // and is intentionally NOT included in the SELECT list to reduce payload size.
  let attemptsQuery = admin
    .from("attempts")
    .select(
      "user_id,standard_id,standard_label,topic,mode,is_correct,time_spent_sec,assignment_id",
    )
    .in("user_id", effectiveStudentIds);
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
  const attempts = ((attemptsData ?? []) as AttemptQueryRow[]).map<AttemptRecord>(
    (row) => ({
      userId: String(row.user_id),
      standardId: row.standard_id,
      standardLabel: row.standard_label,
      topic: row.topic,
      mode: coerceAttemptMode(row.mode),
      isCorrect: Boolean(row.is_correct),
      timeSpentSec: row.time_spent_sec ?? 0,
      assignmentId: row.assignment_id,
    }),
  );

  const payload = buildDashboardResponse({
    attempts,
    topic,
    scopedStudents: scopedStudentIds.map((id) => ({
      id,
      label: studentMap.get(id) ?? id,
      classId: studentClassMap.get(id) ?? null,
    })),
    selectedStudentId: studentId ?? null,
    includeModeBreakdown: mode === "compare",
  });

  return NextResponse.json({
    classes,
    ...payload,
    filters: { range, mode, source, classId: classId ?? null, studentId: studentId ?? null, topic: topic ?? null },
  });
}
