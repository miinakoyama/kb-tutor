import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Question } from "@/types/question";

/**
 * GET /api/assignments/[assignmentId]/history/[attemptNumber]
 *
 * Returns the per-question detail of a single past run for the current
 * student. The questions list is reconstructed by:
 *   - For practice / exam assignments: starting from the question snapshot
 *     (deterministic content), then overlaying the student's latest attempt
 *     for each snapshot question within the (prev, current] completion
 *     window.
 *   - For review assignments: the snapshot isn't present, so we fall back to
 *     the actual attempts in the window and look up question payloads in
 *     generated_questions / assignment_question_snapshots as a backup.
 *
 * The shape returned mirrors `ExamResults` / `FeedbackPanel` consumers:
 * `{ question: Question, answer: { selectedOptionId, isCorrect } | null }`.
 */
export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ assignmentId: string; attemptNumber: string }>;
  },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assignmentId, attemptNumber: attemptNumberRaw } = await context.params;
  const normalizedAssignmentId = assignmentId?.trim();
  const attemptNumber = Number.parseInt(attemptNumberRaw ?? "", 10);
  if (!normalizedAssignmentId) {
    return NextResponse.json({ error: "Missing assignment id" }, { status: 400 });
  }
  if (!Number.isFinite(attemptNumber) || attemptNumber < 1) {
    return NextResponse.json({ error: "Invalid attempt number" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,title,school_id,mode")
    .eq("id", normalizedAssignmentId)
    .maybeSingle();
  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const [{ data: targetRow }, { data: memberRow }] = await Promise.all([
    admin
      .from("assignment_targets")
      .select("assignment_id")
      .eq("assignment_id", normalizedAssignmentId)
      .eq("student_user_id", user.id)
      .maybeSingle(),
    admin
      .from("school_members")
      .select("school_id")
      .eq("school_id", assignment.school_id)
      .eq("student_user_id", user.id)
      .maybeSingle(),
  ]);
  if (!targetRow && !memberRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: completion, error: completionError } = await admin
    .from("assignment_completions")
    .select("attempt_number,started_at,completed_at")
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", user.id)
    .eq("attempt_number", attemptNumber)
    .maybeSingle();
  if (completionError) {
    return NextResponse.json({ error: completionError.message }, { status: 400 });
  }
  if (!completion) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  // Find the previous completion to scope attempts to (prev, current].
  const { data: prevCompletion } = await admin
    .from("assignment_completions")
    .select("completed_at")
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", user.id)
    .lt("attempt_number", attemptNumber)
    .order("attempt_number", { ascending: false })
    .limit(1);
  const prevCompletedAt =
    prevCompletion && prevCompletion.length > 0
      ? String(prevCompletion[0].completed_at)
      : null;
  const completedAt = String(completion.completed_at);

  const attemptsQuery = admin
    .from("attempts")
    .select("question_id,selected_option_id,is_correct,answered_at,topic,standard_id")
    .eq("assignment_id", normalizedAssignmentId)
    .eq("user_id", user.id)
    .lte("answered_at", completedAt)
    .order("answered_at", { ascending: true });
  if (prevCompletedAt) {
    attemptsQuery.gt("answered_at", prevCompletedAt);
  }
  const { data: attemptRows, error: attemptsError } = await attemptsQuery;
  if (attemptsError) {
    return NextResponse.json({ error: attemptsError.message }, { status: 400 });
  }

  type LatestAttempt = {
    selectedOptionId: string | null;
    isCorrect: boolean;
    answeredAt: number;
  };
  const latestByQuestion = new Map<string, LatestAttempt>();
  for (const row of attemptRows ?? []) {
    const qid = String(row.question_id);
    const answeredAt =
      typeof row.answered_at === "string" ? row.answered_at : null;
    const ms = answeredAt ? new Date(answeredAt).getTime() : NaN;
    if (Number.isNaN(ms)) continue;
    const next: LatestAttempt = {
      selectedOptionId:
        typeof row.selected_option_id === "string"
          ? row.selected_option_id
          : null,
      isCorrect: Boolean(row.is_correct),
      answeredAt: ms,
    };
    const prior = latestByQuestion.get(qid);
    if (!prior || ms >= prior.answeredAt) {
      latestByQuestion.set(qid, next);
    }
  }

  const mode = String(assignment.mode ?? "practice");

  type ItemPayload = {
    question: Question;
    answer: { selectedOptionId: string | null; isCorrect: boolean } | null;
  };
  const items: ItemPayload[] = [];

  if (mode === "review") {
    // No snapshot; reconstruct from the attempts themselves in the order
    // they were answered.
    const orderedQuestionIds: string[] = [];
    const seen = new Set<string>();
    for (const row of attemptRows ?? []) {
      const qid = String(row.question_id);
      if (seen.has(qid)) continue;
      seen.add(qid);
      orderedQuestionIds.push(qid);
    }
    if (orderedQuestionIds.length > 0) {
      const payloadById = await loadQuestionPayloads(
        admin,
        orderedQuestionIds,
        normalizedAssignmentId,
      );
      for (const qid of orderedQuestionIds) {
        const payload = payloadById.get(qid);
        if (!payload) continue;
        const latest = latestByQuestion.get(qid);
        items.push({
          question: payload,
          answer: latest
            ? {
                selectedOptionId: latest.selectedOptionId,
                isCorrect: latest.isCorrect,
              }
            : null,
        });
      }
    }
  } else {
    const { data: snapshotRows, error: snapshotError } = await admin
      .from("assignment_question_snapshots")
      .select("order_index,question_id,payload")
      .eq("assignment_id", normalizedAssignmentId)
      .order("order_index", { ascending: true });
    if (snapshotError) {
      return NextResponse.json({ error: snapshotError.message }, { status: 400 });
    }
    for (const row of snapshotRows ?? []) {
      const payload = row.payload as Question | null | undefined;
      if (!payload || !payload.id) continue;
      const latest = latestByQuestion.get(String(row.question_id));
      items.push({
        question: payload,
        answer: latest
          ? {
              selectedOptionId: latest.selectedOptionId,
              isCorrect: latest.isCorrect,
            }
          : null,
      });
    }
  }

  const correctCount = items.filter((item) => item.answer?.isCorrect).length;
  const answeredCount = items.filter((item) => item.answer !== null).length;

  return NextResponse.json({
    assignment: {
      id: String(assignment.id),
      title: String(assignment.title),
      mode,
    },
    attempt: {
      attempt_number: Number(completion.attempt_number),
      started_at: String(completion.started_at),
      completed_at: completedAt,
    },
    summary: {
      total: items.length,
      answered: answeredCount,
      correct: correctCount,
    },
    items,
  });
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function loadQuestionPayloads(
  admin: AdminClient,
  questionIds: string[],
  assignmentId: string,
): Promise<Map<string, Question>> {
  const map = new Map<string, Question>();
  if (questionIds.length === 0) return map;
  const { data: generatedRows } = await admin
    .from("generated_questions")
    .select("id,payload")
    .in("id", questionIds);
  for (const row of generatedRows ?? []) {
    const payload = row.payload as Question | null | undefined;
    if (payload && payload.id) map.set(String(row.id), payload);
  }
  const missing = questionIds.filter((id) => !map.has(id));
  if (missing.length === 0) return map;
  const { data: snapshotRows } = await admin
    .from("assignment_question_snapshots")
    .select("question_id,payload")
    .eq("assignment_id", assignmentId)
    .in("question_id", missing);
  for (const row of snapshotRows ?? []) {
    if (map.has(String(row.question_id))) continue;
    const payload = row.payload as Question | null | undefined;
    if (payload && payload.id) map.set(String(row.question_id), payload);
  }
  return map;
}
