import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  chunkArray,
} from "@/lib/analytics/pagination";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";
import { getStandardById } from "@/lib/standards";
import { resolveQuestionPreviews } from "@/lib/analytics/question-preview";
import { resolveTeacherScope } from "@/lib/analytics/teacher-scope";
import { parseTeacherAnalyticsQuery } from "@/lib/analytics/teacher-analytics-query";
import { listBankQuestionsForStandard } from "@/lib/analytics/standard-bank";
import {
  selectSampleQuestion,
  type SampleQuestionStats,
} from "@/lib/analytics/sample-question-server";

interface ScopeAttemptRow {
  user_id: string;
  question_id: string;
  mode: string | null;
  assignment_id: string | null;
  is_correct: boolean;
  answered_at: string;
}

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

  const bankQuestionIds = await listBankQuestionsForStandard({
    admin,
    standardId,
  });

  // In-scope accuracy per question (only relevant for accuracy modes).
  const inScopeStats = new Map<string, SampleQuestionStats>();
  if (
    scope.studentIds.length > 0 &&
    (query.sampleMode === "high_accuracy_first" ||
      query.sampleMode === "low_accuracy_first")
  ) {
    const attemptRows: ScopeAttemptRow[] = [];
    for (const chunk of chunkArray(
      scope.studentIds,
      ANALYTICS_IN_FILTER_CHUNK_SIZE,
    )) {
      for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
        const { data, error } = await admin
          .from("attempts")
          .select("user_id,question_id,mode,assignment_id,is_correct,answered_at")
          .in("user_id", chunk)
          .eq("standard_id", standardId)
          .order("answered_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + ANALYTICS_PAGE_SIZE - 1);
        if (error) {
          return NextResponse.json(
            { error: "Failed to load sample question stats" },
            { status: 500 },
          );
        }
        const rows = (data ?? []) as ScopeAttemptRow[];
        attemptRows.push(...rows);
        if (rows.length < ANALYTICS_PAGE_SIZE) break;
      }
    }
    const deduped = dedupeAssignmentExamAttempts(attemptRows);
    const buckets = new Map<string, { attempted: number; correct: number }>();
    for (const row of deduped) {
      const bucket = buckets.get(row.question_id) ?? {
        attempted: 0,
        correct: 0,
      };
      bucket.attempted += 1;
      if (row.is_correct) bucket.correct += 1;
      buckets.set(row.question_id, bucket);
    }
    for (const [id, bucket] of buckets) {
      inScopeStats.set(id, {
        attempted: bucket.attempted,
        accuracy: bucket.attempted > 0 ? bucket.correct / bucket.attempted : 0,
      });
    }
  }

  const previews = await resolveQuestionPreviews({
    admin,
    questionIds: bankQuestionIds,
  });

  const seed = query.seed ?? randomUUID();

  const payload = selectSampleQuestion({
    bankQuestionIds,
    previews,
    inScopeStats,
    mode: query.sampleMode,
    seed,
    skip: query.skip,
    standardId,
    standardLabel: standardDef.label,
  });

  return NextResponse.json(payload);
}
