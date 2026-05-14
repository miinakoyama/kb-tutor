import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { parseSchoolIds } from "@/lib/analytics/admin-filters";
import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  appendPage,
  chunkArray,
} from "@/lib/analytics/pagination";

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

type AttemptRow = {
  user_id: string;
  question_id: string;
  assignment_id: string | null;
  mode: string;
  standard_id: string | null;
  standard_label: string | null;
  selected_option_id: string;
  is_correct: boolean;
  time_spent_sec: number | null;
  answered_at: string;
};

type GeneratedQuestionRow = {
  id: string;
  payload: unknown;
  updated_at: string;
};

type SnapshotQuestionRow = {
  question_id: string;
  payload: unknown;
  created_at: string;
};

type ConfidenceEventRow = {
  user_id: string;
  question_id: string | null;
  payload: Record<string, unknown> | null;
};

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ModeSlice = {
  mode: string;
  attempts: number;
  uniqueUsers: number;
  correct: number;
  accuracy: number;
  timeP50: number | null;
  timeP90: number | null;
  timeAvg: number | null;
};

type ChoiceSlice = {
  mode: string;
  optionId: string;
  n: number;
  share: number;
  isCorrectChoice: boolean;
};

type QuestionOptionPreview = {
  id: string;
  text: string;
};

type QuestionPreview = {
  text: string;
  imageUrl: string | null;
  options: QuestionOptionPreview[];
  correctOptionId: string;
  diagram: { type: string; data: unknown } | null;
};

type ConfidenceLevelKey = "not_sure" | "somewhat" | "sure";

type ConfidenceBucket = {
  total: number;
  correct: number;
  incorrect: number;
};

type ConfidenceSummary = {
  total: number;
  byLevel: Record<ConfidenceLevelKey, ConfidenceBucket>;
  overconfidentWrong: number;
  underconfidentRight: number;
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
    accuracy: number;
  } | null;
  choiceStats: ChoiceSlice[];
  firstAnsweredAt: string | null;
  lastAnsweredAt: string | null;
  question: QuestionPreview | null;
  confidence: ConfidenceSummary;
};

type StandardOption = {
  value: string;
  label: string;
};

const MAX_QUESTION_ATTEMPT_ROWS = 200_000;
const MAX_QUESTION_CONFIDENCE_ROWS = 100_000;
const CONFIDENCE_LEVELS: ConfidenceLevelKey[] = ["not_sure", "somewhat", "sure"];

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * ratio);
  return sorted[index] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseQuestionPreview(raw: unknown): QuestionPreview | null {
  const source = asRecord(raw);
  if (!source) return null;

  const textRaw = source.text;
  const text = typeof textRaw === "string" ? textRaw.trim() : "";
  if (!text) return null;

  const optionsRaw = Array.isArray(source.options) ? source.options : [];
  const options = optionsRaw
    .map((entry, index) => {
      const option = asRecord(entry);
      if (!option) return null;
      const idRaw = option.id;
      const textValue = typeof option.text === "string" ? option.text.trim() : "";
      if (!textValue) return null;
      const id =
        typeof idRaw === "string" && idRaw.trim().length > 0
          ? idRaw
          : `opt_${index + 1}`;
      return { id, text: textValue };
    })
    .filter((entry): entry is QuestionOptionPreview => entry !== null);

  if (options.length === 0) return null;

  const correctRaw = source.correctOptionId;
  const fallbackCorrectId = options[0]?.id ?? "opt_1";
  const correctOptionId =
    typeof correctRaw === "string" && options.some((option) => option.id === correctRaw)
      ? correctRaw
      : fallbackCorrectId;

  const imageUrl =
    typeof source.imageUrl === "string" && source.imageUrl.trim().length > 0
      ? source.imageUrl
      : null;

  const diagramRaw = asRecord(source.diagram);
  const diagramType = diagramRaw?.type;
  const diagram =
    typeof diagramType === "string" && "data" in (diagramRaw ?? {})
      ? { type: diagramType, data: diagramRaw?.data }
      : null;

  return {
    text,
    imageUrl,
    options,
    correctOptionId,
    diagram,
  };
}

function emptyConfidenceSummary(): ConfidenceSummary {
  return {
    total: 0,
    byLevel: {
      not_sure: { total: 0, correct: 0, incorrect: 0 },
      somewhat: { total: 0, correct: 0, incorrect: 0 },
      sure: { total: 0, correct: 0, incorrect: 0 },
    },
    overconfidentWrong: 0,
    underconfidentRight: 0,
  };
}

function parseConfidenceLevel(value: unknown): ConfidenceLevelKey | null {
  if (value === "not_sure" || value === "somewhat" || value === "sure") {
    return value;
  }
  return null;
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

async function fetchSchoolMemberUserIds(
  admin: SupabaseAdminClient,
  schoolIds: string[],
): Promise<{ data: string[]; error: string | null }> {
  const ids = new Set<string>();

  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    let query = admin
      .from("school_members")
      .select("student_user_id")
      .order("student_user_id", { ascending: true })
      .range(from, from + ANALYTICS_PAGE_SIZE - 1);
    if (schoolIds.length > 0) {
      query = query.in("school_id", schoolIds);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    const rows = data ?? [];
    rows.forEach((row) => ids.add(String(row.student_user_id)));
    if (rows.length < ANALYTICS_PAGE_SIZE) break;
  }

  return { data: Array.from(ids), error: null };
}

async function fetchExcludedProfileIds(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<{ data: Set<string>; error: string | null }> {
  const excluded = new Set<string>();

  for (const chunk of chunkArray(userIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .in("id", chunk)
        .eq("excluded_from_analytics", true)
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) return { data: new Set(), error: error.message };
      const rows = (data ?? []) as Array<{ id: string }>;
      rows.forEach((row) => excluded.add(String(row.id)));
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  return { data: excluded, error: null };
}

async function fetchAttempts(
  admin: SupabaseAdminClient,
  userIds: string[],
  questionIdFilter: string | null,
): Promise<{ data: AttemptRow[]; error: string | null }> {
  const data: AttemptRow[] = [];

  for (const chunk of chunkArray(userIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      let query = admin
        .from("attempts")
        .select(
          "user_id,question_id,assignment_id,mode,standard_id,standard_label,selected_option_id,is_correct,time_spent_sec,answered_at",
        )
        .in("user_id", chunk)
        .order("answered_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (questionIdFilter) query = query.eq("question_id", questionIdFilter);

      const { data: page, error } = await query;
      if (error) return { data: [], error: error.message };
      const rows = (page ?? []) as AttemptRow[];
      const capError = appendPage(data, rows, MAX_QUESTION_ATTEMPT_ROWS);
      if (capError) return { data: [], error: capError };
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  return { data, error: null };
}

async function fetchGeneratedQuestions(
  admin: SupabaseAdminClient,
  questionIds: string[],
): Promise<{ data: GeneratedQuestionRow[]; error: string | null }> {
  const data: GeneratedQuestionRow[] = [];

  for (const chunk of chunkArray(questionIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data: page, error } = await admin
        .from("generated_questions")
        .select("id,payload,updated_at")
        .in("id", chunk)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) return { data: [], error: error.message };
      const rows = (page ?? []) as GeneratedQuestionRow[];
      data.push(...rows);
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  return { data, error: null };
}

async function fetchSnapshotQuestions(
  admin: SupabaseAdminClient,
  questionIds: string[],
): Promise<{ data: SnapshotQuestionRow[]; error: string | null }> {
  const data: SnapshotQuestionRow[] = [];

  for (const chunk of chunkArray(questionIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data: page, error } = await admin
        .from("assignment_question_snapshots")
        .select("question_id,payload,created_at")
        .in("question_id", chunk)
        .order("created_at", { ascending: false })
        .order("question_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) return { data: [], error: error.message };
      const rows = (page ?? []) as SnapshotQuestionRow[];
      data.push(...rows);
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  return { data, error: null };
}

async function fetchConfidenceEvents(
  admin: SupabaseAdminClient,
  userIds: string[],
  questionIds: string[],
  schoolIds: string[],
): Promise<{ data: ConfidenceEventRow[]; error: string | null }> {
  const data: ConfidenceEventRow[] = [];

  for (const userChunk of chunkArray(userIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (const questionChunk of chunkArray(questionIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
      for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
        let query = admin
          .from("analytics_events")
          .select("user_id,question_id,payload")
          .eq("event_type", "confidence_submitted")
          .in("user_id", userChunk)
          .in("question_id", questionChunk)
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + ANALYTICS_PAGE_SIZE - 1);
        if (schoolIds.length > 0) {
          query = query.in("school_id", schoolIds);
        }

        const { data: page, error } = await query;
        if (error) return { data: [], error: error.message };
        const rows = (page ?? []) as ConfidenceEventRow[];
        const capError = appendPage(data, rows, MAX_QUESTION_CONFIDENCE_ROWS);
        if (capError) return { data: [], error: capError };
        if (rows.length < ANALYTICS_PAGE_SIZE) break;
      }
    }
  }

  return { data, error: null };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const schoolIds = parseSchoolIds(url);
  const standardFilter = url.searchParams.get("standardId");
  const questionIdFilter = url.searchParams.get("questionId");
  const minNRaw = url.searchParams.get("minN");
  const minN = minNRaw ? Math.max(0, Number.parseInt(minNRaw, 10) || 0) : 0;

  const admin = createSupabaseAdminClient();
  let stats: QuestionStatsRow[] = [];
  let choices: ChoiceStatsRow[] = [];
  let firsts: FirstAttemptRow[] = [];
  const { data: memberUserIds, error: memberError } = await fetchSchoolMemberUserIds(
    admin,
    schoolIds,
  );
  if (memberError) {
    return NextResponse.json({ error: memberError }, { status: 400 });
  }

  if (memberUserIds.length === 0) {
    return NextResponse.json({
      questions: [],
      meta: { totalQuestions: 0, totalAttempts: 0, standards: [], confidenceLevels: CONFIDENCE_LEVELS },
    });
  }

  const { data: excludedUserIds, error: excludedError } = await fetchExcludedProfileIds(
    admin,
    memberUserIds,
  );
  if (excludedError) {
    return NextResponse.json({ error: excludedError }, { status: 400 });
  }
  const includedMemberUserIds = memberUserIds.filter((userId) => !excludedUserIds.has(userId));
  const includedMemberUserIdSet = new Set(includedMemberUserIds);

  if (includedMemberUserIds.length === 0) {
    return NextResponse.json({
      questions: [],
      meta: { totalQuestions: 0, totalAttempts: 0, standards: [], confidenceLevels: CONFIDENCE_LEVELS },
    });
  }

  const { data: attemptRows, error: attemptError } = await fetchAttempts(
    admin,
    includedMemberUserIds,
    questionIdFilter,
  );
  if (attemptError) {
    return NextResponse.json({ error: attemptError }, { status: 400 });
  }
  const attempts = dedupeAssignmentExamAttempts((attemptRows ?? []) as AttemptRow[]);

  const statsMap = new Map<
    string,
    {
      questionId: string;
      mode: string;
      standardId: string | null;
      standardLabel: string | null;
      attempts: number;
      users: Set<string>;
      correct: number;
      times: number[];
      firstAnsweredAt: string | null;
      lastAnsweredAt: string | null;
    }
  >();
  const choiceMap = new Map<
    string,
    {
      questionId: string;
      mode: string;
      selectedOptionId: string;
      n: number;
      isCorrectChoice: boolean;
    }
  >();
  const totalByQuestionMode = new Map<string, number>();
  const usersByQuestion = new Map<string, Set<string>>();
  const timesByQuestion = new Map<string, number[]>();
  const firstPracticeByUserQuestion = new Map<
    string,
    { questionId: string; isCorrect: boolean; answeredAt: string }
  >();

  for (const row of attempts) {
    const questionUsers = usersByQuestion.get(row.question_id) ?? new Set<string>();
    questionUsers.add(row.user_id);
    usersByQuestion.set(row.question_id, questionUsers);

    const statsKey = `${row.question_id}::${row.mode}`;
    const statsBucket = statsMap.get(statsKey) ?? {
      questionId: row.question_id,
      mode: row.mode,
      standardId: row.standard_id,
      standardLabel: row.standard_label,
      attempts: 0,
      users: new Set<string>(),
      correct: 0,
      times: [],
      firstAnsweredAt: null,
      lastAnsweredAt: null,
    };
    statsBucket.attempts += 1;
    statsBucket.users.add(row.user_id);
    if (row.is_correct) statsBucket.correct += 1;
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      statsBucket.times.push(row.time_spent_sec);
      const questionTimes = timesByQuestion.get(row.question_id) ?? [];
      questionTimes.push(row.time_spent_sec);
      timesByQuestion.set(row.question_id, questionTimes);
    }
    if (!statsBucket.firstAnsweredAt || row.answered_at < statsBucket.firstAnsweredAt) {
      statsBucket.firstAnsweredAt = row.answered_at;
    }
    if (!statsBucket.lastAnsweredAt || row.answered_at > statsBucket.lastAnsweredAt) {
      statsBucket.lastAnsweredAt = row.answered_at;
    }
    if (!statsBucket.standardId && row.standard_id) statsBucket.standardId = row.standard_id;
    if (!statsBucket.standardLabel && row.standard_label) {
      statsBucket.standardLabel = row.standard_label;
    }
    statsMap.set(statsKey, statsBucket);
    totalByQuestionMode.set(
      statsKey,
      (totalByQuestionMode.get(statsKey) ?? 0) + 1,
    );

    const choiceKey = `${row.question_id}::${row.mode}::${row.selected_option_id}`;
    const choiceBucket = choiceMap.get(choiceKey) ?? {
      questionId: row.question_id,
      mode: row.mode,
      selectedOptionId: row.selected_option_id,
      n: 0,
      isCorrectChoice: false,
    };
    choiceBucket.n += 1;
    choiceBucket.isCorrectChoice = choiceBucket.isCorrectChoice || row.is_correct;
    choiceMap.set(choiceKey, choiceBucket);

    if (row.mode === "practice") {
      const firstKey = `${row.user_id}::${row.question_id}`;
      const first = firstPracticeByUserQuestion.get(firstKey);
      if (!first || row.answered_at < first.answeredAt) {
        firstPracticeByUserQuestion.set(firstKey, {
          questionId: row.question_id,
          isCorrect: row.is_correct,
          answeredAt: row.answered_at,
        });
      }
    }
  }

  stats = Array.from(statsMap.values()).map((bucket) => {
    const attemptsN = bucket.attempts;
    const avg =
      bucket.times.length > 0
        ? bucket.times.reduce((sum, value) => sum + value, 0) / bucket.times.length
        : null;
    return {
      question_id: bucket.questionId,
      mode: bucket.mode,
      standard_id: bucket.standardId,
      standard_label: bucket.standardLabel,
      attempts_n: attemptsN,
      unique_users: bucket.users.size,
      correct_n: bucket.correct,
      accuracy: attemptsN > 0 ? bucket.correct / attemptsN : null,
      time_p50: percentile(bucket.times, 0.5),
      time_p90: percentile(bucket.times, 0.9),
      time_avg: avg,
      first_answered_at: bucket.firstAnsweredAt,
      last_answered_at: bucket.lastAnsweredAt,
    };
  });

  choices = Array.from(choiceMap.values()).map((bucket) => {
    const total = totalByQuestionMode.get(`${bucket.questionId}::${bucket.mode}`) ?? 0;
    return {
      question_id: bucket.questionId,
      mode: bucket.mode,
      selected_option_id: bucket.selectedOptionId,
      n: bucket.n,
      is_correct_choice: bucket.isCorrectChoice,
      share: total > 0 ? bucket.n / total : null,
    };
  });

  const firstPracticeByQuestion = new Map<string, { n: number; correct: number }>();
  for (const row of firstPracticeByUserQuestion.values()) {
    const bucket = firstPracticeByQuestion.get(row.questionId) ?? { n: 0, correct: 0 };
    bucket.n += 1;
    if (row.isCorrect) bucket.correct += 1;
    firstPracticeByQuestion.set(row.questionId, bucket);
  }

  firsts = Array.from(firstPracticeByQuestion.entries()).map(([questionId, bucket]) => ({
    question_id: questionId,
    first_attempt_n: bucket.n,
    first_attempt_correct: bucket.correct,
    first_attempt_accuracy: bucket.n > 0 ? bucket.correct / bucket.n : null,
  }));

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
    const totalCorrect = rows.reduce((sum, row) => sum + row.correct_n, 0);
    const userIdSetSize = usersByQuestion.get(questionId)?.size ?? 0;

    const standardRow = rows.find((row) => row.standard_id) ?? rows[0];
    const firstAnsweredAt =
      rows
        .map((row) => row.first_answered_at)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null;
    const lastAnsweredAt =
      rows
        .map((row) => row.last_answered_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .pop() ?? null;

    const questionTimes = timesByQuestion.get(questionId) ?? [];
    const overallTimeAvg =
      questionTimes.length > 0
        ? questionTimes.reduce((sum, value) => sum + value, 0) / questionTimes.length
        : null;

    const overall: ModeSlice = {
      mode: "all",
      attempts: totalAttempts,
      uniqueUsers: userIdSetSize,
      correct: totalCorrect,
      accuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : 0,
      timeP50: percentile(questionTimes, 0.5),
      timeP90: percentile(questionTimes, 0.9),
      timeAvg: overallTimeAvg,
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
      question: null,
      confidence: emptyConfidenceSummary(),
    });
  }

  const standardByValue = new Map<string, StandardOption>();
  for (const summary of summaries) {
    if (summary.standardId && summary.standardId.trim().length > 0) {
      const key = summary.standardId;
      if (!standardByValue.has(key)) {
        standardByValue.set(key, {
          value: key,
          label: summary.standardLabel?.trim() || key,
        });
      }
      continue;
    }
    if (summary.standardLabel && summary.standardLabel.trim().length > 0) {
      const labelKey = `label:${summary.standardLabel}`;
      if (!standardByValue.has(labelKey)) {
        standardByValue.set(labelKey, {
          value: labelKey,
          label: summary.standardLabel,
        });
      }
    }
  }
  const standards = Array.from(standardByValue.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  const summaryByQuestionId = new Map(summaries.map((summary) => [summary.questionId, summary]));
  const questionIds = summaries.map((summary) => summary.questionId);

  if (questionIds.length > 0) {
    const { data: generatedRows, error: generatedError } =
      await fetchGeneratedQuestions(admin, questionIds);

    if (generatedError) {
      return NextResponse.json({ error: generatedError }, { status: 400 });
    }

    const previewByQuestionId = new Map<
      string,
      { preview: QuestionPreview; timestamp: string }
    >();

    for (const row of (generatedRows ?? []) as GeneratedQuestionRow[]) {
      const questionId = String(row.id);
      const preview = parseQuestionPreview(row.payload);
      if (!preview) continue;
      const existing = previewByQuestionId.get(questionId);
      if (!existing || row.updated_at > existing.timestamp) {
        previewByQuestionId.set(questionId, {
          preview,
          timestamp: row.updated_at,
        });
      }
    }

    const missingQuestionIds = questionIds.filter((id) => !previewByQuestionId.has(id));

    if (missingQuestionIds.length > 0) {
      const { data: snapshotRows, error: snapshotError } =
        await fetchSnapshotQuestions(admin, missingQuestionIds);

      if (snapshotError) {
        return NextResponse.json({ error: snapshotError }, { status: 400 });
      }

      for (const row of (snapshotRows ?? []) as SnapshotQuestionRow[]) {
        const questionId = String(row.question_id);
        if (previewByQuestionId.has(questionId)) continue;
        const preview = parseQuestionPreview(row.payload);
        if (!preview) continue;
        previewByQuestionId.set(questionId, {
          preview,
          timestamp: row.created_at,
        });
      }
    }

    const { data: confidenceRows, error: confidenceError } =
      await fetchConfidenceEvents(
        admin,
        Array.from(includedMemberUserIdSet),
        questionIds,
        schoolIds,
      );
    if (confidenceError) {
      return NextResponse.json({ error: confidenceError }, { status: 400 });
    }

    const confidenceByQuestionId = new Map<string, ConfidenceSummary>();
    for (const questionId of questionIds) {
      confidenceByQuestionId.set(questionId, emptyConfidenceSummary());
    }

    for (const row of (confidenceRows ?? []) as ConfidenceEventRow[]) {
      if (!includedMemberUserIdSet.has(String(row.user_id))) continue;
      const questionId = row.question_id ? String(row.question_id) : "";
      if (!questionId || !summaryByQuestionId.has(questionId)) continue;

      const payload = row.payload;
      const level = parseConfidenceLevel(payload?.confidenceLevel);
      const isCorrect =
        typeof payload?.isCorrect === "boolean" ? payload.isCorrect : null;
      if (!level || isCorrect === null) continue;

      const summary = confidenceByQuestionId.get(questionId) ?? emptyConfidenceSummary();
      const bucket = summary.byLevel[level];
      bucket.total += 1;
      if (isCorrect) {
        bucket.correct += 1;
      } else {
        bucket.incorrect += 1;
      }
      summary.total += 1;

      if (level === "sure" && !isCorrect) {
        summary.overconfidentWrong += 1;
      }
      if (level === "not_sure" && isCorrect) {
        summary.underconfidentRight += 1;
      }

      confidenceByQuestionId.set(questionId, summary);
    }

    for (const summary of summaries) {
      summary.question = previewByQuestionId.get(summary.questionId)?.preview ?? null;
      summary.confidence =
        confidenceByQuestionId.get(summary.questionId) ?? emptyConfidenceSummary();
    }
  }

  let filteredSummaries = summaries;
  if (standardFilter && standardFilter.trim().length > 0) {
    filteredSummaries = filteredSummaries.filter((summary) => {
      if (summary.standardId && summary.standardId === standardFilter) return true;
      if (!summary.standardId && summary.standardLabel) {
        return `label:${summary.standardLabel}` === standardFilter;
      }
      return false;
    });
  }
  if (minN > 0) {
    filteredSummaries = filteredSummaries.filter(
      (summary) => summary.totalAttempts >= minN,
    );
  }

  filteredSummaries.sort((a, b) => b.totalAttempts - a.totalAttempts);

  return NextResponse.json({
    questions: filteredSummaries,
    meta: {
      totalQuestions: filteredSummaries.length,
      totalAttempts: filteredSummaries.reduce(
        (sum, row) => sum + row.totalAttempts,
        0,
      ),
      standards,
      confidenceLevels: CONFIDENCE_LEVELS,
    },
  });
}
