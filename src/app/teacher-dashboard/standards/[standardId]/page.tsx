import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  chunkArray,
} from "@/lib/analytics/pagination";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStandardById } from "@/lib/standards";
import { resolveQuestionPreviews } from "@/lib/analytics/question-preview";
import { resolveTeacherScope } from "@/lib/analytics/teacher-scope";
import {
  attemptModesFromFilter,
  parseTeacherAnalyticsQuery,
} from "@/lib/analytics/teacher-analytics-query";
import {
  buildStandardDrillDown,
  type DrillDownAttemptRow,
} from "@/lib/analytics/standard-drill-down-server";
import { StandardDrillDownTable } from "@/components/teacher/StandardDrillDownTable";
import { QuestionDetailDrawer } from "@/components/teacher/QuestionDetailDrawer";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ standardId: string }>;
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

export default async function StandardDrillDownPage({
  params,
  searchParams,
}: PageProps) {
  const { standardId } = await params;
  const resolvedSearchParams = await searchParams;
  const standardDef = getStandardById(standardId);
  if (!standardDef) {
    notFound();
  }

  const queryResult = parseTeacherAnalyticsQuery(
    searchParamsToURLSearchParams(resolvedSearchParams),
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
          Please sign in to view standard analytics.
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

  let payload = buildStandardDrillDown({
    attempts: [],
    previews: new Map(),
    standardId,
    standardLabel: standardDef.label,
  });

  if (scope.studentIds.length > 0) {
    let effectiveStudentIds = scope.studentIds;
    if (query.studentId && scope.studentIds.includes(query.studentId)) {
      effectiveStudentIds = [query.studentId];
    } else if (query.studentId) {
      effectiveStudentIds = [];
    }

    if (effectiveStudentIds.length > 0) {
      const modeFilter = attemptModesFromFilter(query.mode);
      let rangeFromIso: string | null = null;
      if (query.range !== "all") {
        const days = query.range === "7d" ? 7 : 30;
        const from = new Date();
        from.setDate(from.getDate() - days);
        rangeFromIso = from.toISOString();
      }
      const attemptRows: DrillDownAttemptRow[] = [];
      for (const chunk of chunkArray(
        effectiveStudentIds,
        ANALYTICS_IN_FILTER_CHUNK_SIZE,
      )) {
        for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
          let query2 = admin
            .from("attempts")
            .select(
              "user_id,question_id,mode,assignment_id,selected_option_id,is_correct,time_spent_sec,answered_at",
            )
            .in("user_id", chunk)
            .eq("standard_id", standardId)
            .order("answered_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, from + ANALYTICS_PAGE_SIZE - 1);
          if (rangeFromIso) query2 = query2.gte("answered_at", rangeFromIso);
          if (modeFilter.length === 1) query2 = query2.eq("mode", modeFilter[0]);
          else if (modeFilter.length < 3) query2 = query2.in("mode", modeFilter);
          if (query.source === "assigned")
            query2 = query2.not("assignment_id", "is", null);
          else if (query.source === "self")
            query2 = query2.is("assignment_id", null);
          const { data, error } = await query2;
          if (error) {
            throw new Error(`attempts query failed: ${error.message}`);
          }
          const rows = (data ?? []) as DrillDownAttemptRow[];
          attemptRows.push(...rows);
          if (rows.length < ANALYTICS_PAGE_SIZE) break;
        }
      }
      const distinctQuestionIds = Array.from(
        new Set(attemptRows.map((row) => row.question_id)),
      );
      const previews = await resolveQuestionPreviews({
        admin,
        questionIds: distinctQuestionIds,
      });
      payload = buildStandardDrillDown({
        attempts: attemptRows,
        previews,
        standardId,
        standardLabel: standardDef.label,
      });
    }
  }

  const dashboardHref = `/teacher-dashboard${buildDashboardQuery(resolvedSearchParams)}`;

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
          {standardDef.id}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-gray/80">
          {standardDef.label}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-gray/60">
          Module {standardDef.module} · {standardDef.category}
        </p>
      </section>

      <StandardDrillDownTable payload={payload} />
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
