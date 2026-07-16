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
  resolveAttemptStandardId,
  roundPercent,
} from "@/lib/analytics/teacher-dashboard-server";
import {
  addConfidenceSubmission,
  emptyConfidenceQuadrantCounts,
  fetchConfidenceEvents,
  parseConfidenceLevel,
  toConfidenceQuadrantPercents,
  type ConfidenceQuadrantPercents,
} from "@/lib/analytics/confidence";
import {
  fetchQuestionPreviewsByIdentity,
  questionPreviewIdentityKey,
  resolveQuestionTypeFromAttempts,
  type QuestionPreview,
  type QuestionType,
} from "@/lib/analytics/question-preview";
import { compareShortAnswerAttempts } from "@/lib/analytics/short-answer-attempt-order";
import { getStandardById } from "@/lib/standards";
import type { GradedFeedback, PartLabel } from "@/types/short-answer";

interface AttemptQueryRow {
  user_id: string;
  question_id: string;
  standard_id: string | null;
  topic: string | null;
  mode: string | null;
  selected_option_id: string;
  is_correct: boolean;
  time_spent_sec: number | null;
  assignment_id: string | null;
  answered_at: string;
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

export interface QuestionDetailChoice {
  id: string;
  text: string;
  isCorrect: boolean;
  count: number;
  percent: number;
}

export interface ShortAnswerResponseDetail {
  attemptId: string;
  studentId: string;
  studentLabel: string;
  partLabel: PartLabel;
  attemptNumber: number;
  responseText: string;
  score: number;
  maxScore: number;
  isCorrect: boolean;
  feedback: GradedFeedback | null;
  answeredAt: string;
}

export interface QuestionDetailResponse {
  standard: { id: string; label: string } | null;
  question: {
    questionId: string;
    setId: string | null;
    questionType: QuestionType | null;
    preview: QuestionPreview | null;
  };
  summary: {
    attempted: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
  };
  choices: QuestionDetailChoice[];
  shortAnswerResponses: ShortAnswerResponseDetail[];
  totalStudents: number;
  confidence: ConfidenceQuadrantPercents;
  filters: {
    range: RangeKey;
    mode: ModeFilter;
    source: SourceFilter;
    classId: string | null;
    studentId: string | null;
  };
}

interface ShortAnswerAttemptQueryRow {
  id: string;
  user_id: string;
  part_label: string;
  attempt_number: number;
  response_text: string;
  score: number;
  max_score: number;
  is_correct: boolean;
  feedback: unknown;
  answered_at: string;
}

const PART_LABELS = new Set<PartLabel>(["A", "B", "C"]);

function isPartLabel(value: string): value is PartLabel {
  return PART_LABELS.has(value as PartLabel);
}

function parseGradedFeedback(raw: unknown): GradedFeedback | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.verdict !== "string" || !Array.isArray(record.segments)) return null;
  return record as unknown as GradedFeedback;
}

export async function fetchShortAnswerResponseDetails(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  params: {
    questionId: string;
    questionSetId: string | null;
    studentIds: string[];
    studentLabelById: Map<string, string>;
    range: RangeKey;
    mode: ModeFilter;
    source: SourceFilter;
  },
): Promise<{ data: ShortAnswerResponseDetail[]; error: string | null }> {
  let query = admin
    .from("short_answer_attempts")
    .select(
      "id,user_id,part_label,attempt_number,response_text,score,max_score,is_correct,feedback,answered_at",
    )
    .in("user_id", params.studentIds)
    .eq("question_id", params.questionId);
  query = params.questionSetId
    ? query.eq("question_set_id", params.questionSetId)
    : query.is("question_set_id", null);
  if (params.range !== "all") {
    const days = params.range === "7d" ? 7 : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    query = query.gte("answered_at", from.toISOString());
  }
  if (params.mode !== "all" && params.mode !== "compare") {
    query = query.eq("mode", params.mode);
  }
  if (params.source === "assigned") {
    query = query.not("assignment_id", "is", null);
  } else if (params.source === "self") {
    query = query.is("assignment_id", null);
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };

  const details = ((data ?? []) as ShortAnswerAttemptQueryRow[])
    .filter((row) => isPartLabel(row.part_label))
    .map((row) => ({
      attemptId: row.id,
      studentId: row.user_id,
      studentLabel: params.studentLabelById.get(row.user_id) ?? row.user_id,
      partLabel: row.part_label as PartLabel,
      attemptNumber: row.attempt_number,
      responseText: row.response_text,
      score: row.score,
      maxScore: row.max_score,
      isCorrect: row.is_correct,
      feedback: parseGradedFeedback(row.feedback),
      answeredAt: row.answered_at,
    }))
    .sort(compareShortAnswerAttempts);

  return { data: details, error: null };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ standardId: string; questionId: string }> },
) {
  const { standardId: rawStandardId, questionId: rawQuestionId } = await context.params;
  const standardId = decodeURIComponent(rawStandardId);
  const questionId = decodeURIComponent(rawQuestionId);

  const url = new URL(request.url);
  const requestedSetId = url.searchParams.get("setId")?.trim() || null;
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

  const filters = {
    range,
    mode,
    source,
    classId: classId ?? null,
    studentId: studentId ?? null,
  };

  let questionQuery = admin
    .from("generated_questions")
    .select("set_id")
    .eq("id", questionId);
  if (requestedSetId) {
    questionQuery = questionQuery.eq("set_id", requestedSetId);
  }
  const { data: questionRow } = await questionQuery.maybeSingle();
  const setId = requestedSetId ?? (questionRow?.set_id ? String(questionRow.set_id) : null);

  const emptyResponse: QuestionDetailResponse = {
    standard: standardInfo ? { id: standardInfo.id, label: standardInfo.label } : null,
    question: { questionId, setId, questionType: null, preview: null },
    summary: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
    choices: [],
    shortAnswerResponses: [],
    totalStudents: 0,
    confidence: { mastery: 0, misconception: 0, fragile: 0, expected: 0, total: 0 },
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
  const studentLabelById = new Map(
    effectiveStudents.map((student) => [student.id, student.label]),
  );

  let attemptsQuery = admin
    .from("attempts")
    .select("user_id,question_id,standard_id,topic,mode,selected_option_id,is_correct,time_spent_sec,assignment_id,answered_at")
    .in("user_id", studentIds)
    .eq("question_id", questionId);
  attemptsQuery = setId
    ? attemptsQuery.eq("question_set_id", setId)
    : attemptsQuery.is("question_set_id", null);
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
    console.error("[teacher/standards/questions] attempts query failed", attemptsError);
    return NextResponse.json({ error: "Failed to load attempts data" }, { status: 500 });
  }

  const attempts = dedupeAssignmentExamAttempts(
    (attemptsData ?? []) as AttemptQueryRow[],
  ).filter(
    (row) =>
      resolveAttemptStandardId(row.standard_id, row.topic) === standardId,
  );
  const questionIdentity = { questionId, questionSetId: setId };
  const { data: previewByIdentity, error: previewError } =
    await fetchQuestionPreviewsByIdentity(admin, [questionIdentity]);
  if (previewError) {
    return NextResponse.json({ error: previewError }, { status: 500 });
  }
  const preview =
    previewByIdentity.get(questionPreviewIdentityKey(questionIdentity)) ?? null;
  const questionType = resolveQuestionTypeFromAttempts(attempts, preview);

  let shortAnswerResponses: ShortAnswerResponseDetail[] = [];
  if (questionType === "open-ended") {
    const { data: saqDetails, error: saqError } = await fetchShortAnswerResponseDetails(
      admin,
      {
        questionId,
        questionSetId: setId,
        studentIds,
        studentLabelById,
        range,
        mode,
        source,
      },
    );
    if (saqError) {
      return NextResponse.json({ error: saqError }, { status: 500 });
    }
    shortAnswerResponses = saqDetails;
  }

  if (attempts.length === 0) {
    return NextResponse.json({
      ...emptyResponse,
      question: { questionId, setId, questionType, preview },
      shortAnswerResponses,
    });
  }

  // --- Summary ---
  let correct = 0;
  let timeTotal = 0;
  let timeCount = 0;
  for (const row of attempts) {
    if (row.is_correct) correct += 1;
    if (typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)) {
      timeTotal += row.time_spent_sec;
      timeCount += 1;
    }
  }
  const accuracy = roundPercent((correct / attempts.length) * 100);
  const averageTimeSec = timeCount > 0 ? Math.round(timeTotal / timeCount) : 0;

  // --- Per-choice breakdown (latest attempt per student) ---
  const latestByStudent = new Map<string, AttemptQueryRow>();
  for (const row of attempts) {
    const existing = latestByStudent.get(row.user_id);
    if (!existing || row.answered_at > existing.answered_at) {
      latestByStudent.set(row.user_id, row);
    }
  }
  const totalStudents = latestByStudent.size;
  const choiceCounts = new Map<string, number>();
  for (const row of latestByStudent.values()) {
    choiceCounts.set(row.selected_option_id, (choiceCounts.get(row.selected_option_id) ?? 0) + 1);
  }
  const choices: QuestionDetailChoice[] =
    questionType === "mcq" && preview?.questionType === "mcq"
      ? preview.options.map((option) => {
          const count = choiceCounts.get(option.id) ?? 0;
          return {
            id: option.id,
            text: option.text,
            isCorrect: option.id === preview.correctOptionId,
            count,
            percent: totalStudents > 0 ? roundPercent((count / totalStudents) * 100) : 0,
          };
        })
      : [];

  // --- Confidence quadrants (MCQ only — SAQ has no confidence self-assessment step) ---
  const confidenceCounts = emptyConfidenceQuadrantCounts();
  if (questionType === "mcq") {
    const { data: confidenceRows, error: confidenceError } = await fetchConfidenceEvents(
      admin,
      studentIds,
      [questionId],
    );
    if (confidenceError) {
      return NextResponse.json({ error: confidenceError }, { status: 500 });
    }
    for (const row of confidenceRows) {
      const level = parseConfidenceLevel(row.payload?.confidenceLevel);
      const isCorrect = typeof row.payload?.isCorrect === "boolean" ? row.payload.isCorrect : null;
      if (!level || isCorrect === null) continue;
      addConfidenceSubmission(confidenceCounts, level, isCorrect);
    }
  }

  const response: QuestionDetailResponse = {
    standard: standardInfo ? { id: standardInfo.id, label: standardInfo.label } : null,
    question: { questionId, setId, questionType, preview },
    summary: {
      attempted: attempts.length,
      correct,
      accuracy,
      averageTimeSec,
    },
    choices,
    shortAnswerResponses,
    totalStudents,
    confidence: toConfidenceQuadrantPercents(confidenceCounts),
    filters,
  };

  return NextResponse.json(response);
}
