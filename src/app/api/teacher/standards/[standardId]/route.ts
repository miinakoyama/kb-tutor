import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveTeacherRoster,
  TeacherRosterLookupError,
} from "@/lib/analytics/teacher-roster";
import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";
import {
  classifyPerformance,
  resolveAttemptStandardId,
  roundPercent,
  type AttemptMode,
  type StandardStatus,
  type ModeMetrics,
} from "@/lib/analytics/teacher-dashboard-server";
import { loadTeacherThresholds } from "@/lib/analytics/teacher-thresholds";
import {
  addConfidenceSubmission,
  emptyConfidenceQuadrantCounts,
  fetchConfidenceEvents,
  parseConfidenceLevel,
  toConfidenceQuadrantPercents,
  type ConfidenceQuadrantCounts,
  type ConfidenceQuadrantPercents,
} from "@/lib/analytics/confidence";
import {
  fetchQuestionPreviewsByIdentity,
  questionPreviewIdentityKey,
  resolveQuestionTypeFromAttempts,
  type QuestionPreview,
  type QuestionType,
} from "@/lib/analytics/question-preview";
import { getStandardById } from "@/lib/standards";

interface AttemptQueryRow {
  user_id: string;
  question_id: string;
  question_set_id: string | null;
  standard_id: string | null;
  topic: string | null;
  mode: string | null;
  is_correct: boolean;
  time_spent_sec: number | null;
  assignment_id: string | null;
  answered_at: string;
  selected_option_id: string | null;
}

const ATTEMPT_MODES = ["practice", "exam", "review"] as const satisfies readonly AttemptMode[];

function coerceAttemptMode(raw: string | null): AttemptMode {
  return ATTEMPT_MODES.find((m) => m === raw) ?? "practice";
}

function emptyModeMetrics(): ModeMetrics {
  return { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0, studentsAttempted: 0 };
}

function buildModeMetrics(rows: AttemptQueryRow[]): Record<AttemptMode, ModeMetrics> {
  const byModeAgg: Record<AttemptMode, ModeMetrics> = {
    practice: emptyModeMetrics(),
    exam: emptyModeMetrics(),
    review: emptyModeMetrics(),
  };
  const byModeTime: Record<AttemptMode, { total: number; count: number }> = {
    practice: { total: 0, count: 0 },
    exam: { total: 0, count: 0 },
    review: { total: 0, count: 0 },
  };
  const byModeStudents: Record<AttemptMode, Set<string>> = {
    practice: new Set(),
    exam: new Set(),
    review: new Set(),
  };
  for (const row of rows) {
    const attemptMode = coerceAttemptMode(row.mode);
    const modeMetrics = byModeAgg[attemptMode];
    modeMetrics.attempted += 1;
    if (row.is_correct) modeMetrics.correct += 1;
    byModeStudents[attemptMode].add(row.user_id);
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      byModeTime[attemptMode].total += row.time_spent_sec;
      byModeTime[attemptMode].count += 1;
    }
  }
  for (const m of ATTEMPT_MODES) {
    const metrics = byModeAgg[m];
    metrics.accuracy = metrics.attempted > 0 ? roundPercent((metrics.correct / metrics.attempted) * 100) : 0;
    const time = byModeTime[m];
    metrics.averageTimeSec = time.count > 0 ? Math.round(time.total / time.count) : 0;
    metrics.studentsAttempted = byModeStudents[m].size;
  }
  return byModeAgg;
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

export interface StandardDetailQuestion {
  questionId: string;
  setId: string | null;
  questionType: QuestionType;
  preview: QuestionPreview | null;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
  practiceFirstAttempt: { n: number; correct: number; accuracy: number } | null;
  confidence: ConfidenceQuadrantPercents;
}

export interface StandardDetailResponse {
  standard: { id: string; label: string; category: string; module: "A" | "B" } | null;
  summary: {
    attempted: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
    status: StandardStatus;
    byMode: Record<AttemptMode, ModeMetrics>;
    saqAverageTimeSec: number;
    /** SAQ-only mode breakdown. */
    saqByMode: Record<AttemptMode, ModeMetrics>;
  };
  confidence: ConfidenceQuadrantPercents;
  mcqQuestions: StandardDetailQuestion[];
  shortAnswerQuestions: StandardDetailQuestion[];
  filters: {
    range: RangeKey;
    mode: ModeFilter;
    source: SourceFilter;
    classId: string | null;
    studentId: string | null;
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ standardId: string }> },
) {
  const { standardId: rawStandardId } = await context.params;
  const standardId = decodeURIComponent(rawStandardId);

  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId") || undefined;
  const classId = url.searchParams.get("classId") || undefined;
  const range = parseEnum<RangeKey>(url.searchParams.get("range"), ["7d", "30d", "all"] as const, "30d");
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
  if (role !== "teacher" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const standardInfo = getStandardById(standardId);

  const { thresholds } = await loadTeacherThresholds(user.id);
  const filters = {
    range,
    mode,
    source,
    classId: classId ?? null,
    studentId: studentId ?? null,
  };

  const emptyResponse: StandardDetailResponse = {
    standard: standardInfo
      ? { id: standardInfo.id, label: standardInfo.label, category: standardInfo.category, module: standardInfo.module }
      : null,
    summary: {
      attempted: 0,
      correct: 0,
      accuracy: 0,
      averageTimeSec: 0,
      status: "not_started",
      byMode: { practice: emptyModeMetrics(), exam: emptyModeMetrics(), review: emptyModeMetrics() },
      saqAverageTimeSec: 0,
      saqByMode: { practice: emptyModeMetrics(), exam: emptyModeMetrics(), review: emptyModeMetrics() },
    },
    confidence: { mastery: 0, misconception: 0, fragile: 0, expected: 0, total: 0 },
    mcqQuestions: [],
    shortAnswerQuestions: [],
    filters,
  };

  let roster;
  try {
    roster = await resolveTeacherRoster(admin, user.id, role);
  } catch (error) {
    if (error instanceof TeacherRosterLookupError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }
  const { classes, scopedStudents } = roster;
  if (scopedStudents.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  const effectiveStudents =
    classId && classes.some((c) => c.id === classId)
      ? scopedStudents.filter((student) => student.classIds.includes(classId))
      : scopedStudents;
  if (effectiveStudents.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  const studentIds =
    studentId && effectiveStudents.some((s) => s.id === studentId)
      ? [studentId]
      : effectiveStudents.map((s) => s.id);

  let attemptsQuery = admin
    .from("attempts")
    .select(
      "user_id,question_id,question_set_id,standard_id,topic,mode,is_correct,time_spent_sec,assignment_id,answered_at,selected_option_id",
    )
    .in("user_id", studentIds);
  attemptsQuery = standardInfo
    ? attemptsQuery.or(
        `standard_id.eq.${standardInfo.id},standard_id.is.null`,
      )
    : attemptsQuery.eq("standard_id", standardId);
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
    console.error("[teacher/standards] attempts query failed", attemptsError);
    return NextResponse.json({ error: "Failed to load attempts data" }, { status: 500 });
  }

  const attempts = dedupeAssignmentExamAttempts(
    (attemptsData ?? []) as AttemptQueryRow[],
  ).filter(
    (row) =>
      resolveAttemptStandardId(row.standard_id, row.topic) === standardId,
  );

  if (attempts.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  // MCQ and SAQ are fundamentally different tasks (single click vs. multi-part
  // constructed response), so the standard-level summary/status/mode-breakdown
  // is MCQ-only; SAQ gets its own parallel mode breakdown below.
  const mcqAttempts = attempts.filter((row) => row.selected_option_id !== "short-answer");
  const saqAttempts = attempts.filter((row) => row.selected_option_id === "short-answer");

  // --- Standard-level summary (MCQ only) ---
  let overallCorrect = 0;
  let overallTimeTotal = 0;
  let overallTimeCount = 0;
  for (const row of mcqAttempts) {
    if (row.is_correct) overallCorrect += 1;
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      overallTimeTotal += row.time_spent_sec;
      overallTimeCount += 1;
    }
  }
  const totalAttempted = mcqAttempts.length;
  const overallAccuracy = totalAttempted > 0 ? roundPercent((overallCorrect / totalAttempted) * 100) : 0;
  const overallAverageTimeSec = overallTimeCount > 0 ? Math.round(overallTimeTotal / overallTimeCount) : 0;
  const status = classifyPerformance(overallAccuracy, totalAttempted, thresholds);

  const byModeAgg = buildModeMetrics(mcqAttempts);
  const saqByModeAgg = buildModeMetrics(saqAttempts);

  let saqTimeTotal = 0;
  let saqTimeCount = 0;
  for (const row of saqAttempts) {
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      saqTimeTotal += row.time_spent_sec;
      saqTimeCount += 1;
    }
  }
  const saqAverageTimeSec = saqTimeCount > 0 ? Math.round(saqTimeTotal / saqTimeCount) : 0;

  // --- Per-question aggregation (both MCQ and SAQ questions; split downstream by preview type) ---
  interface QuestionAgg {
    questionId: string;
    questionSetId: string | null;
    isShortAnswer: boolean;
    attempted: number;
    correct: number;
    timeTotal: number;
    timeCount: number;
  }
  const questionAgg = new Map<string, QuestionAgg>();
  const firstPracticeByUserQuestion = new Map<
    string,
    { identityKey: string; isCorrect: boolean; answeredAt: string }
  >();

  for (const row of attempts) {
    const attemptMode = coerceAttemptMode(row.mode);
    const identity = {
      questionId: row.question_id,
      questionSetId: row.question_set_id,
    };
    const identityKey = questionPreviewIdentityKey(identity);

    const qAgg = questionAgg.get(identityKey) ?? {
      ...identity,
      isShortAnswer: false,
      attempted: 0,
      correct: 0,
      timeTotal: 0,
      timeCount: 0,
    };
    if (resolveQuestionTypeFromAttempts([row], null) === "open-ended") {
      qAgg.isShortAnswer = true;
    }
    qAgg.attempted += 1;
    if (row.is_correct) qAgg.correct += 1;
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      qAgg.timeTotal += row.time_spent_sec;
      qAgg.timeCount += 1;
    }
    questionAgg.set(identityKey, qAgg);

    if (attemptMode === "practice") {
      const key = JSON.stringify([
        row.user_id,
        row.question_set_id,
        row.question_id,
      ]);
      const first = firstPracticeByUserQuestion.get(key);
      if (!first || row.answered_at < first.answeredAt) {
        firstPracticeByUserQuestion.set(key, {
          identityKey,
          isCorrect: row.is_correct,
          answeredAt: row.answered_at,
        });
      }
    }
  }

  const firstPracticeByQuestion = new Map<string, { n: number; correct: number }>();
  for (const value of firstPracticeByUserQuestion.values()) {
    const bucket = firstPracticeByQuestion.get(value.identityKey) ?? {
      n: 0,
      correct: 0,
    };
    bucket.n += 1;
    if (value.isCorrect) bucket.correct += 1;
    firstPracticeByQuestion.set(value.identityKey, bucket);
  }

  // --- Confidence quadrants (overall + per question) ---
  const questionIds = Array.from(
    new Set(Array.from(questionAgg.values()).map((agg) => agg.questionId)),
  );
  const { data: confidenceRows, error: confidenceError } = await fetchConfidenceEvents(
    admin,
    studentIds,
    questionIds,
  );
  if (confidenceError) {
    return NextResponse.json({ error: confidenceError }, { status: 500 });
  }

  const overallConfidence = emptyConfidenceQuadrantCounts();
  const confidenceByQuestion = new Map<string, ConfidenceQuadrantCounts>();
  for (const questionId of questionIds) {
    confidenceByQuestion.set(questionId, emptyConfidenceQuadrantCounts());
  }
  for (const row of confidenceRows) {
    const questionId = row.question_id ? String(row.question_id) : "";
    if (!questionId || !confidenceByQuestion.has(questionId)) continue;
    const level = parseConfidenceLevel(row.payload?.confidenceLevel);
    const isCorrect = typeof row.payload?.isCorrect === "boolean" ? row.payload.isCorrect : null;
    if (!level || isCorrect === null) continue;
    addConfidenceSubmission(overallConfidence, level, isCorrect);
    addConfidenceSubmission(confidenceByQuestion.get(questionId)!, level, isCorrect);
  }

  const questionIdentities = Array.from(questionAgg.values()).map((agg) => ({
    questionId: agg.questionId,
    questionSetId: agg.questionSetId,
  }));
  const { data: previewByIdentity, error: previewError } =
    await fetchQuestionPreviewsByIdentity(admin, questionIdentities);
  if (previewError) {
    return NextResponse.json({ error: previewError }, { status: 500 });
  }

  const questions: StandardDetailQuestion[] = Array.from(questionAgg.entries())
    .map(([identityKey, agg]) => {
      const accuracy = agg.attempted > 0 ? roundPercent((agg.correct / agg.attempted) * 100) : 0;
      const averageTimeSec = agg.timeCount > 0 ? Math.round(agg.timeTotal / agg.timeCount) : 0;
      const firstAttempt = firstPracticeByQuestion.get(identityKey);
      const questionType: QuestionType = agg.isShortAnswer
        ? "open-ended"
        : "mcq";
      return {
        questionId: agg.questionId,
        setId: agg.questionSetId,
        questionType,
        preview: previewByIdentity.get(identityKey) ?? null,
        attempted: agg.attempted,
        correct: agg.correct,
        accuracy,
        averageTimeSec,
        practiceFirstAttempt: firstAttempt
          ? {
              n: firstAttempt.n,
              correct: firstAttempt.correct,
              accuracy: roundPercent((firstAttempt.correct / firstAttempt.n) * 100),
            }
          : null,
        confidence: toConfidenceQuadrantPercents(
          confidenceByQuestion.get(agg.questionId) ?? emptyConfidenceQuadrantCounts(),
        ),
      };
    })
    .sort((a, b) => b.attempted - a.attempted);

  const mcqQuestions = questions.filter((q) => q.questionType === "mcq");
  const shortAnswerQuestions = questions.filter(
    (q) => q.questionType === "open-ended",
  );

  const response: StandardDetailResponse = {
    standard: standardInfo
      ? { id: standardInfo.id, label: standardInfo.label, category: standardInfo.category, module: standardInfo.module }
      : null,
    summary: {
      attempted: totalAttempted,
      correct: overallCorrect,
      accuracy: overallAccuracy,
      averageTimeSec: overallAverageTimeSec,
      status,
      byMode: byModeAgg,
      saqAverageTimeSec,
      saqByMode: saqByModeAgg,
    },
    confidence: toConfidenceQuadrantPercents(overallConfidence),
    mcqQuestions,
    shortAnswerQuestions,
    filters,
  };

  return NextResponse.json(response);
}
