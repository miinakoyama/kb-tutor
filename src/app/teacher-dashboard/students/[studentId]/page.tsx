import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
import { StudentProfileView } from "@/components/teacher/StudentProfileView";
import { QuestionDetailDrawer } from "@/components/teacher/QuestionDetailDrawer";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function searchParamsToURLSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  return params;
}

export default async function StudentProfilePage({
  params,
  searchParams,
}: PageProps) {
  const { studentId } = await params;
  const resolved = await searchParams;
  const queryResult = parseTeacherAnalyticsQuery(
    searchParamsToURLSearchParams(resolved),
  );
  if (!queryResult.ok) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10">
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {queryResult.error}
        </p>
      </main>
    );
  }
  const query = queryResult.query;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10">
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Please sign in to view student analytics.
        </p>
      </main>
    );
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (!role || !["teacher", "admin"].includes(role)) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10">
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          You do not have access to teacher analytics.
        </p>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  const scope = await resolveTeacherScope({
    admin,
    userId: user.id,
    role,
    classIdFilter: query.classId,
    scopeMode: query.scope,
  });

  const student = scope.studentMap.get(studentId);
  if (!student) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-10">
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          You do not have access to this student.
        </p>
      </main>
    );
  }

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
      throw new Error(`attempts query failed: ${error.message}`);
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
        throw new Error(`assignments query failed: ${error.message}`);
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

  const dashboardHref = `/teacher-dashboard${buildDashboardQuery(resolved)}`;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href={dashboardHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#166534] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <section className="mt-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d]">
          {student.label}
        </h1>
        <p className="mt-1 text-sm text-slate-gray/70">
          {student.classLabel}
        </p>
      </section>

      <StudentProfileView payload={payload} />
      <QuestionDetailDrawer role={role} />
    </main>
  );
}

function buildDashboardQuery(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  const passthroughKeys = ["range", "mode", "source", "classId", "topic"];
  for (const key of passthroughKeys) {
    const value = searchParams[key];
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      params.set(key, value[0]);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
