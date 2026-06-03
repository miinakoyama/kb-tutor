import { NextResponse } from "next/server";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  chunkArray,
} from "@/lib/analytics/pagination";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveQuestionPreviews } from "@/lib/analytics/question-preview";
import { resolveTeacherScope } from "@/lib/analytics/teacher-scope";
import {
  attemptModesFromFilter,
  parseTeacherAnalyticsQuery,
} from "@/lib/analytics/teacher-analytics-query";
import {
  buildStudentProfile,
  type StudentProfileAttemptRow,
} from "@/lib/analytics/student-profile-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await context.params;
  if (!studentId || typeof studentId !== "string") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseTeacherAnalyticsQuery(new URL(request.url));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const query = parsed.query;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (!role || !["teacher", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const scope = await resolveTeacherScope({
    admin,
    userId: user.id,
    role,
    classIdFilter: query.classId,
    scopeMode: query.scope,
  });

  if (!scope.studentMap.has(studentId)) {
    // Do not leak whether the student exists outside this teacher's
    // scope; respond 403, not 404 (per FR-002 and the contract).
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const student = scope.studentMap.get(studentId)!;

  const modeFilter = attemptModesFromFilter(query.mode);
  let rangeFromIso: string | null = null;
  if (query.range !== "all") {
    const days = query.range === "7d" ? 7 : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    rangeFromIso = from.toISOString();
  }

  const attemptRows: StudentProfileAttemptRow[] = [];
  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    let q = admin
      .from("attempts")
      .select(
        "id,user_id,question_id,mode,assignment_id,standard_id,standard_label,selected_option_id,is_correct,time_spent_sec,answered_at",
      )
      .eq("user_id", studentId)
      .order("answered_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + ANALYTICS_PAGE_SIZE - 1);
    if (rangeFromIso) q = q.gte("answered_at", rangeFromIso);
    if (modeFilter.length === 1) q = q.eq("mode", modeFilter[0]);
    else if (modeFilter.length < 3) q = q.in("mode", modeFilter);
    if (query.source === "assigned") q = q.not("assignment_id", "is", null);
    else if (query.source === "self") q = q.is("assignment_id", null);
    if (query.assignmentId) q = q.eq("assignment_id", query.assignmentId);
    if (query.standardIdFilter) q = q.eq("standard_id", query.standardIdFilter);
    const { data, error } = await q;
    if (error) {
      return NextResponse.json(
        { error: "Failed to load student profile" },
        { status: 500 },
      );
    }
    const rows = (data ?? []) as StudentProfileAttemptRow[];
    attemptRows.push(...rows);
    if (rows.length < ANALYTICS_PAGE_SIZE) break;
  }

  const distinctQuestionIds = Array.from(
    new Set(attemptRows.map((row) => row.question_id)),
  );
  const previews = await resolveQuestionPreviews({
    admin,
    questionIds: distinctQuestionIds,
  });

  const distinctAssignmentIds = Array.from(
    new Set(
      attemptRows
        .map((row) => row.assignment_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const assignmentLabels = new Map<string, string>();
  if (distinctAssignmentIds.length > 0) {
    for (const chunk of chunkArray(
      distinctAssignmentIds,
      ANALYTICS_IN_FILTER_CHUNK_SIZE,
    )) {
      const { data, error } = await admin
        .from("assignments")
        .select("id,title")
        .in("id", chunk);
      if (error) {
        return NextResponse.json(
          { error: "Failed to load assignments" },
          { status: 500 },
        );
      }
      for (const row of (data ?? []) as { id: string; title: string | null }[]) {
        assignmentLabels.set(String(row.id), String(row.title ?? row.id));
      }
    }
  }

  const payload = buildStudentProfile({
    attempts: attemptRows,
    student,
    previews,
    assignmentLabels,
    cursor: query.cursor,
  });

  return NextResponse.json(payload);
}
