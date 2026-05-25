import { NextResponse } from "next/server";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  appendPage,
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

const MAX_DRILL_DOWN_ATTEMPTS = 200_000;

export async function GET(
  request: Request,
  context: { params: Promise<{ standardId: string }> },
) {
  const { standardId } = await context.params;
  if (!standardId || typeof standardId !== "string") {
    return NextResponse.json({ error: "Unknown standard" }, { status: 404 });
  }

  const standardDef = getStandardById(standardId);
  if (!standardDef) {
    return NextResponse.json({ error: "Unknown standard" }, { status: 404 });
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

  const emptyPayload = buildStandardDrillDown({
    attempts: [],
    previews: new Map(),
    standardId,
    standardLabel: standardDef.label,
  });

  if (scope.studentIds.length === 0) {
    return NextResponse.json(emptyPayload);
  }

  let effectiveStudentIds = scope.studentIds;
  if (query.studentId) {
    if (!scope.studentIds.includes(query.studentId)) {
      // Hide the student silently: keep the standard, return empty rows.
      return NextResponse.json(emptyPayload);
    }
    effectiveStudentIds = [query.studentId];
  }

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
      let attemptsQuery = admin
        .from("attempts")
        .select(
          "user_id,question_id,mode,assignment_id,selected_option_id,is_correct,time_spent_sec,answered_at",
        )
        .in("user_id", chunk)
        .eq("standard_id", standardId)
        .order("answered_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (rangeFromIso) {
        attemptsQuery = attemptsQuery.gte("answered_at", rangeFromIso);
      }
      if (modeFilter.length === 1) {
        attemptsQuery = attemptsQuery.eq("mode", modeFilter[0]);
      } else if (modeFilter.length < 3) {
        attemptsQuery = attemptsQuery.in("mode", modeFilter);
      }
      if (query.source === "assigned") {
        attemptsQuery = attemptsQuery.not("assignment_id", "is", null);
      } else if (query.source === "self") {
        attemptsQuery = attemptsQuery.is("assignment_id", null);
      }
      const { data, error } = await attemptsQuery;
      if (error) {
        return NextResponse.json(
          { error: "Failed to load standard drill-down" },
          { status: 500 },
        );
      }
      const rows = (data ?? []) as DrillDownAttemptRow[];
      const capError = appendPage(attemptRows, rows, MAX_DRILL_DOWN_ATTEMPTS);
      if (capError) {
        return NextResponse.json({ error: capError }, { status: 400 });
      }
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

  const payload = buildStandardDrillDown({
    attempts: attemptRows,
    previews,
    standardId,
    standardLabel: standardDef.label,
  });

  return NextResponse.json(payload);
}
