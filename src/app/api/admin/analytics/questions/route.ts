import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

type QuestionStatsRow = {
  question_id: string;
  mode: string;
  standard_id: string | null;
  standard_label: string | null;
  attempts_n: number;
  unique_users: number;
  correct_n: number;
  accuracy: number | string | null;
  time_p50: number | string | null;
  time_p90: number | string | null;
  time_avg: number | string | null;
  first_answered_at: string | null;
  last_answered_at: string | null;
};

type ChoiceStatsRow = {
  question_id: string;
  mode: string;
  selected_option_id: string;
  n: number;
  is_correct_choice: boolean;
  share: number | string | null;
};

type FirstAttemptRow = {
  question_id: string;
  first_attempt_n: number;
  first_attempt_correct: number;
  first_attempt_accuracy: number | string | null;
};

type ModeSlice = {
  mode: string;
  attempts: number;
  uniqueUsers: number;
  correct: number;
  accuracy: number; // 0..1
  timeP50: number | null;
  timeP90: number | null;
  timeAvg: number | null;
};

type ChoiceSlice = {
  mode: string;
  optionId: string;
  n: number;
  share: number; // 0..1
  isCorrectChoice: boolean;
};

type QuestionSummary = {
  questionId: string;
  standardId: string | null;
  standardLabel: string | null;
  totalAttempts: number;
  totalUniqueUsers: number;
  overall: ModeSlice;
  modes: Record<string, ModeSlice | null>;
  practiceFirstAttempt: {
    n: number;
    correct: number;
    accuracy: number; // 0..1
  } | null;
  choiceStats: ChoiceSlice[];
  firstAnsweredAt: string | null;
  lastAnsweredAt: string | null;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

async function requireAdmin() {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await requester
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, userId: user.id };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const standardFilter = url.searchParams.get("standardId");
  const questionIdFilter = url.searchParams.get("questionId");
  const minNRaw = url.searchParams.get("minN");
  const minN = minNRaw ? Math.max(0, Number.parseInt(minNRaw, 10) || 0) : 0;

  const admin = createSupabaseAdminClient();

  let statsQuery = admin
    .from("question_stats_v")
    .select(
      "question_id,mode,standard_id,standard_label,attempts_n,unique_users,correct_n,accuracy,time_p50,time_p90,time_avg,first_answered_at,last_answered_at",
    );
  if (questionIdFilter) statsQuery = statsQuery.eq("question_id", questionIdFilter);
  if (standardFilter) statsQuery = statsQuery.eq("standard_id", standardFilter);

  const { data: statsRows, error: statsError } = await statsQuery;
  if (statsError) {
    return NextResponse.json({ error: statsError.message }, { status: 400 });
  }

  let choiceQuery = admin
    .from("question_choice_stats_v")
    .select("question_id,mode,selected_option_id,n,is_correct_choice,share");
  if (questionIdFilter) choiceQuery = choiceQuery.eq("question_id", questionIdFilter);

  const { data: choiceRows, error: choiceError } = await choiceQuery;
  if (choiceError) {
    return NextResponse.json({ error: choiceError.message }, { status: 400 });
  }

  let firstQuery = admin
    .from("practice_first_attempt_accuracy_v")
    .select("question_id,first_attempt_n,first_attempt_correct,first_attempt_accuracy");
  if (questionIdFilter) firstQuery = firstQuery.eq("question_id", questionIdFilter);

  const { data: firstRows, error: firstError } = await firstQuery;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  const stats = (statsRows ?? []) as QuestionStatsRow[];
  const choices = (choiceRows ?? []) as ChoiceStatsRow[];
  const firsts = (firstRows ?? []) as FirstAttemptRow[];

  const firstByQuestion = new Map(firsts.map((row) => [row.question_id, row]));

  const byQuestion = new Map<string, QuestionStatsRow[]>();
  for (const row of stats) {
    const list = byQuestion.get(row.question_id) ?? [];
    list.push(row);
    byQuestion.set(row.question_id, list);
  }

  const choicesByQuestion = new Map<string, ChoiceStatsRow[]>();
  for (const row of choices) {
    const list = choicesByQuestion.get(row.question_id) ?? [];
    list.push(row);
    choicesByQuestion.set(row.question_id, list);
  }

  function buildModeSlice(rows: QuestionStatsRow[], mode: string): ModeSlice | null {
    const match = rows.find((row) => row.mode === mode);
    if (!match) return null;
    return {
      mode,
      attempts: match.attempts_n,
      uniqueUsers: match.unique_users,
      correct: match.correct_n,
      accuracy: toNumber(match.accuracy) ?? 0,
      timeP50: toNumber(match.time_p50),
      timeP90: toNumber(match.time_p90),
      timeAvg: toNumber(match.time_avg),
    };
  }

  const summaries: QuestionSummary[] = [];
  for (const [questionId, rows] of byQuestion) {
    const totalAttempts = rows.reduce((sum, row) => sum + row.attempts_n, 0);
    if (totalAttempts < minN) continue;

    const totalCorrect = rows.reduce((sum, row) => sum + row.correct_n, 0);
    const userIdSetSize = rows.reduce((max, row) => Math.max(max, row.unique_users), 0);

    const standardRow = rows.find((row) => row.standard_id) ?? rows[0];
    const firstAnsweredAt = rows
      .map((row) => row.first_answered_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
    const lastAnsweredAt = rows
      .map((row) => row.last_answered_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? null;

    const overallTimeRow = rows.reduce<QuestionStatsRow | null>(
      (acc, row) => (!acc || row.attempts_n > acc.attempts_n ? row : acc),
      null,
    );

    const overall: ModeSlice = {
      mode: "all",
      attempts: totalAttempts,
      uniqueUsers: userIdSetSize,
      correct: totalCorrect,
      accuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : 0,
      timeP50: overallTimeRow ? toNumber(overallTimeRow.time_p50) : null,
      timeP90: overallTimeRow ? toNumber(overallTimeRow.time_p90) : null,
      timeAvg: overallTimeRow ? toNumber(overallTimeRow.time_avg) : null,
    };

    const firstRow = firstByQuestion.get(questionId);
    const practiceFirstAttempt = firstRow
      ? {
          n: firstRow.first_attempt_n,
          correct: firstRow.first_attempt_correct,
          accuracy: toNumber(firstRow.first_attempt_accuracy) ?? 0,
        }
      : null;

    const choiceList = (choicesByQuestion.get(questionId) ?? []).map<ChoiceSlice>((row) => ({
      mode: row.mode,
      optionId: row.selected_option_id,
      n: row.n,
      share: toNumber(row.share) ?? 0,
      isCorrectChoice: row.is_correct_choice,
    }));

    summaries.push({
      questionId,
      standardId: standardRow?.standard_id ?? null,
      standardLabel: standardRow?.standard_label ?? null,
      totalAttempts,
      totalUniqueUsers: userIdSetSize,
      overall,
      modes: {
        practice: buildModeSlice(rows, "practice"),
        exam: buildModeSlice(rows, "exam"),
        review: buildModeSlice(rows, "review"),
      },
      practiceFirstAttempt,
      choiceStats: choiceList,
      firstAnsweredAt,
      lastAnsweredAt,
    });
  }

  summaries.sort((a, b) => b.totalAttempts - a.totalAttempts);

  return NextResponse.json({
    questions: summaries,
    meta: {
      totalQuestions: summaries.length,
      totalAttempts: summaries.reduce((sum, row) => sum + row.totalAttempts, 0),
    },
  });
}
