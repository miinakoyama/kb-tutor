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
  buildQuestionDetail,
  type QuestionDetailAttemptRow,
} from "@/lib/analytics/question-detail-server";
import type { ScopeMode } from "@/lib/analytics/teacher-analytics-types";

export async function GET(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await context.params;
  if (!questionId || typeof questionId !== "string") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
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
  const scopeMode: ScopeMode =
    role === "admin" && query.scope === "all" ? "all" : "selected";
  const scope = await resolveTeacherScope({
    admin,
    userId: user.id,
    role,
    classIdFilter: query.classId,
    scopeMode,
  });

  const previews = await resolveQuestionPreviews({
    admin,
    questionIds: [questionId],
  });
  const preview = previews.get(questionId) ?? null;

  let resolvedStandardId: string | null = null;
  let resolvedStandardLabel: string | null = null;

  const attemptRows: QuestionDetailAttemptRow[] = [];
  if (scope.studentIds.length > 0) {
    const modeFilter = attemptModesFromFilter(query.mode);
    let rangeFromIso: string | null = null;
    if (query.range !== "all") {
      const days = query.range === "7d" ? 7 : 30;
      const from = new Date();
      from.setDate(from.getDate() - days);
      rangeFromIso = from.toISOString();
    }
    for (const chunk of chunkArray(
      scope.studentIds,
      ANALYTICS_IN_FILTER_CHUNK_SIZE,
    )) {
      for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
        let q = admin
          .from("attempts")
          .select(
            "user_id,question_id,mode,assignment_id,selected_option_id,is_correct,time_spent_sec,answered_at,standard_id,standard_label",
          )
          .in("user_id", chunk)
          .eq("question_id", questionId)
          .order("answered_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + ANALYTICS_PAGE_SIZE - 1);
        if (rangeFromIso) q = q.gte("answered_at", rangeFromIso);
        if (modeFilter.length === 1) q = q.eq("mode", modeFilter[0]);
        else if (modeFilter.length < 3) q = q.in("mode", modeFilter);
        if (query.source === "assigned")
          q = q.not("assignment_id", "is", null);
        else if (query.source === "self") q = q.is("assignment_id", null);
        const { data, error } = await q;
        if (error) {
          return NextResponse.json(
            { error: "Failed to load question detail" },
            { status: 500 },
          );
        }
        const rows = (data ?? []) as Array<
          QuestionDetailAttemptRow & {
            standard_id: string | null;
            standard_label: string | null;
          }
        >;
        for (const row of rows) {
          if (!resolvedStandardId && row.standard_id) {
            resolvedStandardId = row.standard_id;
            resolvedStandardLabel = row.standard_label;
          }
        }
        for (const row of rows) {
          const { standard_id, standard_label, ...rest } = row;
          void standard_id;
          void standard_label;
          attemptRows.push(rest);
        }
        if (rows.length < ANALYTICS_PAGE_SIZE) break;
      }
    }
  }

  if (!preview && attemptRows.length === 0) {
    // 404 only when there is no preview AND no attempts referencing the
    // question id (per the contract).
    const probe = await admin
      .from("attempts")
      .select("question_id")
      .eq("question_id", questionId)
      .limit(1);
    if (!probe.data || probe.data.length === 0) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
  }

  // Build studentContext only when the requested studentId is in scope.
  let studentContext: { studentId: string; label: string } | undefined;
  if (query.studentId && scope.studentMap.has(query.studentId)) {
    const s = scope.studentMap.get(query.studentId)!;
    studentContext = { studentId: s.id, label: s.label };
  }

  const payload = buildQuestionDetail({
    attempts: attemptRows,
    preview,
    questionId,
    standardId: resolvedStandardId,
    standardLabel: resolvedStandardLabel,
    scope: scopeMode,
    studentContext,
  });

  return NextResponse.json(payload);
}
