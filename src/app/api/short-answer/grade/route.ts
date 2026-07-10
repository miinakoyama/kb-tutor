import { NextResponse } from "next/server";
import { canStudentAccessAssignment } from "@/lib/assignments/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applyAssignmentRunFilter,
  resolveAssignmentRunAfter,
} from "@/lib/short-answer/assignment-run";
import { evaluateShortAnswerQuestionCompletion } from "@/lib/short-answer/question-completion";
import { loadShortAnswerPart } from "@/lib/short-answer/load-item";
import { resolveFeedbackConfig } from "@/lib/short-answer/settings";
import { gradePart } from "@/lib/short-answer/grading";
import { emptySubmissionFeedback, feedbackToPlainText } from "@/lib/short-answer/grading/common";
import type { GradedFeedback, PartLabel, ShortAnswerPart } from "@/types/short-answer";
import type { PracticeMode } from "@/types/question";
import type { SupabaseClient } from "@supabase/supabase-js";

interface GradeRequestBody {
  questionId: string;
  questionSetId?: string | null;
  assignmentId?: string | null;
  sessionId?: string | null;
  practiceRunAfter?: string | null;
  partLabel: PartLabel;
  studentResponse: string;
  attemptNumber: number;
  priorGaps?: Record<string, string>;
  mode: PracticeMode;
  clientAttemptId: string;
}

const PART_LABELS: PartLabel[] = ["A", "B", "C"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AssignmentMetadata {
  schoolId: string | null;
  mode: PracticeMode;
}

function toPracticeMode(value: unknown): PracticeMode {
  return value === "practice" || value === "exam" || value === "review"
    ? value
    : "practice";
}

async function resolveAssignmentMetadata(
  admin: SupabaseClient,
  assignmentId: string,
): Promise<AssignmentMetadata> {
  const { data } = await admin
    .from("assignments")
    .select("school_id, mode")
    .eq("id", assignmentId)
    .maybeSingle();
  return {
    schoolId: typeof data?.school_id === "string" ? data.school_id : null,
    mode: toPracticeMode(data?.mode),
  };
}

function parseBody(raw: unknown): GradeRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.questionId !== "string" || !b.questionId) return null;
  if (typeof b.partLabel !== "string" || !PART_LABELS.includes(b.partLabel as PartLabel)) {
    return null;
  }
  if (typeof b.studentResponse !== "string") return null;
  if (b.attemptNumber !== 1 && b.attemptNumber !== 2) return null;
  if (b.mode !== "practice" && b.mode !== "exam" && b.mode !== "review") return null;
  if (typeof b.clientAttemptId !== "string" || !UUID_RE.test(b.clientAttemptId)) {
    return null;
  }
  if (b.sessionId != null && (typeof b.sessionId !== "string" || !UUID_RE.test(b.sessionId))) {
    return null;
  }
  const practiceRunAfter =
    typeof b.practiceRunAfter === "string" &&
    Number.isFinite(Date.parse(b.practiceRunAfter))
      ? b.practiceRunAfter
      : null;
  const priorGaps =
    b.priorGaps && typeof b.priorGaps === "object"
      ? (b.priorGaps as Record<string, string>)
      : undefined;
  return {
    questionId: b.questionId,
    questionSetId: typeof b.questionSetId === "string" ? b.questionSetId : null,
    assignmentId: typeof b.assignmentId === "string" ? b.assignmentId : null,
    sessionId: typeof b.sessionId === "string" ? b.sessionId : null,
    practiceRunAfter,
    partLabel: b.partLabel as PartLabel,
    studentResponse: b.studentResponse,
    attemptNumber: b.attemptNumber,
    priorGaps,
    mode: b.mode as PracticeMode,
    clientAttemptId: b.clientAttemptId,
  };
}

async function maybeRecordQuestionSummary(
  supabase: SupabaseClient,
  params: {
    userId: string;
    questionId: string;
    assignmentId: string | null | undefined;
    assignmentRunAfter: string | null;
    practiceRunAfter?: string | null;
    mode: PracticeMode;
    standardId: string;
    parts: ShortAnswerPart[];
    maxAttemptsPerPart: number;
  },
): Promise<void> {
  let query = supabase
    .from("short_answer_attempts")
    .select(
      "id, question_id, part_label, attempt_number, response_text, feedback, is_correct, answered_at",
    )
    .eq("user_id", params.userId)
    .eq("question_id", params.questionId);
  if (params.assignmentId) {
    query = query.eq("assignment_id", params.assignmentId);
    query = applyAssignmentRunFilter(
      query,
      params.assignmentId,
      params.assignmentRunAfter,
    );
  } else {
    query = query.is("assignment_id", null);
    if (params.practiceRunAfter) {
      query = query.gt("answered_at", params.practiceRunAfter);
    }
  }
  const { data: rows } = await query;
  const completion = evaluateShortAnswerQuestionCompletion(
    params.parts,
    rows ?? [],
    { maxAttemptsPerPart: params.maxAttemptsPerPart },
  );
  if (!completion.allResolved || !completion.latestAnsweredAt) return;

  let existingQuery = supabase
    .from("attempts")
    .select("id")
    .eq("user_id", params.userId)
    .eq("question_id", params.questionId)
    .eq("selected_option_id", "short-answer");
  existingQuery = params.assignmentId
    ? existingQuery.eq("assignment_id", params.assignmentId)
    : existingQuery.is("assignment_id", null);
  if (params.assignmentId && params.assignmentRunAfter) {
    existingQuery = existingQuery.gt("answered_at", params.assignmentRunAfter);
  } else if (!params.assignmentId && params.practiceRunAfter) {
    existingQuery = existingQuery.gt("answered_at", params.practiceRunAfter);
  }
  const { data: existingSummary } = await existingQuery.maybeSingle();
  if (existingSummary) return;

  await supabase.from("attempts").insert({
    user_id: params.userId,
    assignment_id: params.assignmentId ?? null,
    question_id: params.questionId,
    selected_option_id: "short-answer",
    is_correct: completion.allCorrect,
    mode: params.mode,
    standard_id: params.standardId,
    answered_at: completion.latestAnsweredAt,
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  const loaded = await (async () => {
    if (body.assignmentId) {
      const admin = createSupabaseAdminClient();
      const allowed = await canStudentAccessAssignment(
        admin,
        user.id,
        body.assignmentId,
      );
      if (!allowed) {
        return { forbidden: true as const, admin: null, assignmentRunAfter: null };
      }
      const assignmentMetadata = await resolveAssignmentMetadata(
        admin,
        body.assignmentId,
      );
      const item = await loadShortAnswerPart(admin, {
        questionId: body.questionId,
        partLabel: body.partLabel,
        assignmentId: body.assignmentId,
      });
      const assignmentRunAfter = await resolveAssignmentRunAfter(
        admin,
        body.assignmentId,
        user.id,
      );
      return {
        forbidden: false as const,
        item,
        admin,
        assignmentRunAfter,
        assignmentSchoolId: assignmentMetadata.schoolId,
        effectiveMode: assignmentMetadata.mode,
      };
    }

    const item = await loadShortAnswerPart(supabase, {
      questionId: body.questionId,
      partLabel: body.partLabel,
      assignmentId: body.assignmentId,
    });
    return {
      forbidden: false as const,
      item,
      admin: null,
      assignmentRunAfter: null as string | null,
      assignmentSchoolId: null as string | null,
      effectiveMode: body.mode,
    };
  })();

  if (loaded.forbidden) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!loaded.item) {
    return NextResponse.json(
      { error: "Question not found or not a short-answer item" },
      { status: 404 },
    );
  }
  const { item, part } = loaded.item;
  const assignmentRunAfter = loaded.assignmentRunAfter;
  const assignmentSchoolId = loaded.assignmentSchoolId;
  const effectiveMode = loaded.effectiveMode;

  if (body.studentResponse.length > part.maxLength) {
    return NextResponse.json(
      { error: "Response exceeds the maximum length" },
      { status: 400 },
    );
  }

  const maxAttempts = effectiveMode === "exam" ? 1 : 2;

  // Idempotent replay: return the stored result for a known clientAttemptId.
  const { data: existing } = await supabase
    .from("short_answer_attempts")
    .select(
      "id, score, max_score, is_correct, feedback, confidence, attempt_number",
    )
    .eq("client_attempt_id", body.clientAttemptId)
    .maybeSingle();
  if (existing) {
    const resolved =
      existing.is_correct || existing.attempt_number >= maxAttempts;
    return NextResponse.json({
      attemptId: existing.id,
      score: existing.score,
      maxScore: existing.max_score,
      correct: existing.is_correct,
      resolved,
      feedback: existing.feedback,
      confidence: existing.confidence ?? undefined,
      triesLeft: resolved ? 0 : Math.max(0, maxAttempts - existing.attempt_number),
    });
  }

  // Enforce the attempt cap: reject if the slot is taken or the part resolved.
  let priorQuery = supabase
    .from("short_answer_attempts")
    .select("attempt_number, is_correct")
    .eq("user_id", user.id)
    .eq("question_id", body.questionId)
    .eq("part_label", body.partLabel);
  if (body.assignmentId) {
    priorQuery = priorQuery.eq("assignment_id", body.assignmentId);
    priorQuery = applyAssignmentRunFilter(
      priorQuery,
      body.assignmentId,
      assignmentRunAfter,
    );
  } else {
    priorQuery = priorQuery.is("assignment_id", null);
    priorQuery = body.sessionId
      ? priorQuery.eq("session_id", body.sessionId)
      : priorQuery.is("session_id", null);
    if (body.practiceRunAfter) {
      priorQuery = priorQuery.gt("answered_at", body.practiceRunAfter);
    }
  }
  const { data: priorAttempts } = await priorQuery;
  const attempts = priorAttempts ?? [];
  const alreadyResolved =
    attempts.some((a) => a.is_correct) || attempts.length >= maxAttempts;
  const slotTaken = attempts.some((a) => a.attempt_number === body.attemptNumber);
  if (body.attemptNumber > maxAttempts || alreadyResolved || slotTaken) {
    return NextResponse.json(
      { error: "Attempt cap reached or part already resolved" },
      { status: 409 },
    );
  }

  const answeredAt = new Date().toISOString();
  const trimmed = body.studentResponse.trim();

  let score = 0;
  let correct = false;
  let feedback = emptySubmissionFeedback();
  let method = "none";
  let modelId: string | null = null;
  let temperature: number | null = null;
  let tokenCount: number | null = null;
  let latencyMs: number | null = null;
  let confidence: string | null = null;
  let diagnosedGap: string | null = null;

  if (trimmed.length > 0) {
    const config = await resolveFeedbackConfig(user.id, {
      schoolId: assignmentSchoolId,
    });

    let attempt1Feedback = "";
    let attempt1Gap = "";
    if (body.attemptNumber === 2) {
      let attempt1Query = supabase
        .from("short_answer_attempts")
        .select("feedback, diagnosed_gap")
        .eq("user_id", user.id)
        .eq("question_id", body.questionId)
        .eq("part_label", body.partLabel)
        .eq("attempt_number", 1);
      attempt1Query = body.assignmentId
        ? attempt1Query.eq("assignment_id", body.assignmentId)
        : attempt1Query.is("assignment_id", null);
      attempt1Query = applyAssignmentRunFilter(
        attempt1Query,
        body.assignmentId,
        assignmentRunAfter,
      );
      if (!body.assignmentId) {
        attempt1Query = body.sessionId
          ? attempt1Query.eq("session_id", body.sessionId)
          : attempt1Query.is("session_id", null);
        if (body.practiceRunAfter) {
          attempt1Query = attempt1Query.gt("answered_at", body.practiceRunAfter);
        }
      }
      const { data: attempt1Row } = await attempt1Query.maybeSingle();
      if (attempt1Row) {
        attempt1Feedback = feedbackToPlainText(
          attempt1Row.feedback as GradedFeedback,
        );
        attempt1Gap =
          typeof attempt1Row.diagnosed_gap === "string"
            ? attempt1Row.diagnosed_gap.trim()
            : "";
      }
    }

    try {
      const result = await gradePart({
        method: config.method,
        modelId: config.modelId,
        temperature: config.temperature,
        item,
        part,
        studentResponse: body.studentResponse,
        priorGaps: body.priorGaps,
        attemptNumber: body.attemptNumber,
        maxAttempts,
        attempt1Feedback,
        attempt1Gap,
      });
      score = result.score;
      correct = result.correct;
      feedback = result.feedback;
      method = config.method;
      modelId = config.modelId;
      temperature = config.temperature;
      tokenCount = result.tokenCount ?? null;
      latencyMs = result.latencyMs ?? null;
      confidence = result.confidence ?? null;
      diagnosedGap = result.diagnosedGap ?? null;
    } catch (err) {
      console.error("[short-answer/grade] grading failed", err);
      return NextResponse.json(
        { error: "grading_unavailable", retriable: true },
        { status: 502 },
      );
    }
  }

  const resolved = correct || body.attemptNumber >= maxAttempts;

  const admin = createSupabaseAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from("short_answer_attempts")
    .insert({
      user_id: user.id,
      question_id: body.questionId,
      question_set_id: body.questionSetId,
      assignment_id: body.assignmentId,
      session_id: body.assignmentId ? null : body.sessionId,
      assignment_run_after: body.assignmentId ? assignmentRunAfter : null,
      part_label: body.partLabel,
      attempt_number: body.attemptNumber,
      client_attempt_id: body.clientAttemptId,
      mode: effectiveMode,
      response_text: body.studentResponse,
      score,
      max_score: part.maxScore,
      is_correct: correct,
      feedback,
      diagnosed_gap: diagnosedGap,
      confidence,
      method,
      model_id: modelId,
      temperature,
      token_count: tokenCount,
      latency_ms: latencyMs,
      answered_at: answeredAt,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[short-answer/grade] insert failed", insertError);
    return NextResponse.json(
      { error: "Failed to record attempt" },
      { status: 500 },
    );
  }

  if (resolved) {
    await maybeRecordQuestionSummary(admin, {
      userId: user.id,
      questionId: body.questionId,
      assignmentId: body.assignmentId,
      assignmentRunAfter,
      practiceRunAfter: body.assignmentId ? null : body.practiceRunAfter,
      mode: effectiveMode,
      standardId: item.blueprint.targetStandard,
      parts: item.parts,
      maxAttemptsPerPart: maxAttempts,
    });
  }

  return NextResponse.json({
    attemptId: inserted.id,
    score,
    maxScore: part.maxScore,
    correct,
    resolved,
    feedback,
    confidence: confidence ?? undefined,
    triesLeft: resolved ? 0 : Math.max(0, maxAttempts - body.attemptNumber),
  });
}
