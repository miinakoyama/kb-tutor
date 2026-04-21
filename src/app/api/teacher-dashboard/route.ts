import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildDashboardResponse,
  type AttemptRecord,
} from "@/lib/analytics/teacher-dashboard-server";

interface AttemptQueryRow {
  user_id: string;
  standard_id: string | null;
  standard_label: string | null;
  topic: string | null;
  mode: string | null;
  is_correct: boolean;
  time_spent_sec: number | null;
  assignment_id: string | null;
  answered_at: string;
}

type RangeKey = "7d" | "30d" | "all";
type ModeFilter = "practice" | "exam" | "review" | "all";
type SourceFilter = "assigned" | "self" | "all";

function parseEnum<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!raw) return fallback;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
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
    ["practice", "exam", "review", "all"] as const,
    "practice",
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
    const [{ data: schoolTeachers }, { data: legacySchools }] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", user.id),
      admin.from("schools").select("id").eq("teacher_user_id", user.id),
    ]);
    schoolIds = Array.from(
      new Set([
        ...(schoolTeachers ?? []).map((row) => row.school_id),
        ...(legacySchools ?? []).map((row) => row.id),
      ]),
    );
  } else {
    const { data: allSchools } = await admin
      .from("schools")
      .select("id")
      .order("name", { ascending: true });
    schoolIds = (allSchools ?? []).map((row) => row.id);
  }

  const { data: schoolRows } = schoolIds.length
    ? await admin.from("schools").select("id,name").in("id", schoolIds)
    : { data: [] as { id: string; name: string }[] };

  const classes = (schoolRows ?? [])
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

  const { data: memberRows } = await admin
    .from("school_members")
    .select("school_id,student_user_id")
    .in("school_id", effectiveClassIds);

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

  const { data: profileRows } = await admin
    .from("profiles")
    .select("id,display_name,student_id")
    .in("id", scopedStudentIds);

  const studentMap = new Map<string, string>();
  for (const profile of profileRows ?? []) {
    studentMap.set(
      String(profile.id),
      String(profile.display_name || profile.student_id || profile.id),
    );
  }

  let attemptsQuery = admin
    .from("attempts")
    .select(
      "user_id,standard_id,standard_label,topic,mode,is_correct,time_spent_sec,assignment_id,answered_at",
    )
    .in("user_id", effectiveStudentIds);
  if (range !== "all") {
    const days = range === "7d" ? 7 : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    attemptsQuery = attemptsQuery.gte("answered_at", from.toISOString());
  }
  if (mode !== "all") {
    attemptsQuery = attemptsQuery.eq("mode", mode);
  }
  if (source === "assigned") {
    attemptsQuery = attemptsQuery.not("assignment_id", "is", null);
  } else if (source === "self") {
    attemptsQuery = attemptsQuery.is("assignment_id", null);
  }

  const { data: attemptsData } = await attemptsQuery;
  const attempts = ((attemptsData ?? []) as AttemptQueryRow[]).map<AttemptRecord>(
    (row) => ({
      userId: String(row.user_id),
      standardId: row.standard_id,
      standardLabel: row.standard_label,
      topic: row.topic,
      mode: (row.mode as AttemptRecord["mode"]) ?? "practice",
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
  });

  return NextResponse.json({
    classes,
    ...payload,
    filters: { range, mode, source, classId: classId ?? null, studentId: studentId ?? null, topic: topic ?? null },
  });
}
