import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Question } from "@/types/question";
import {
  buildHistoryAnswerForQuestion,
  buildLatestMcqAttemptsByQuestion,
  buildShortAnswerAttemptsByQuestion,
  isHistoryAnswerAnswered,
  isHistoryAnswerCorrect,
  orderedQuestionIdsFromAttempts,
  summarizeHistoryItems,
  type AssignmentHistoryItem,
  type McqAttemptRow,
  type ShortAnswerAttemptRow,
} from "@/lib/assignments/history";

/**
 * GET /api/assignments/[assignmentId]/history/[attemptNumber]
 *
 * Returns per-question detail for one completed run. Supports both MCQ
 * (`attempts`) and short-answer (`short_answer_attempts`) items.
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

  const [{ data: attemptRows, error: attemptsError }, { data: saqRows, error: saqError }] =
    await Promise.all([
      admin
        .from("attempts")
        .select("question_id,selected_option_id,is_correct,answered_at,topic,standard_id")
        .eq("assignment_id", normalizedAssignmentId)
        .eq("user_id", user.id)
        .lte("answered_at", completedAt)
        .order("answered_at", { ascending: true }),
      admin
        .from("short_answer_attempts")
        .select(
          "question_id,part_label,attempt_number,response_text,is_correct,feedback,answered_at",
        )
        .eq("assignment_id", normalizedAssignmentId)
        .eq("user_id", user.id)
        .lte("answered_at", completedAt)
        .order("answered_at", { ascending: true }),
    ]);
  if (attemptsError) {
    return NextResponse.json({ error: attemptsError.message }, { status: 400 });
  }
  if (saqError) {
    return NextResponse.json({ error: saqError.message }, { status: 400 });
  }

  const mcqRows = (attemptRows ?? []) as McqAttemptRow[];
  const shortAnswerRows = (saqRows ?? []) as ShortAnswerAttemptRow[];
  const mcqLatest = buildLatestMcqAttemptsByQuestion(
    mcqRows,
    prevCompletedAt,
    completedAt,
  );
  const saqByQuestion = buildShortAnswerAttemptsByQuestion(
    shortAnswerRows,
    prevCompletedAt,
    completedAt,
  );

  const mode = String(assignment.mode ?? "practice");
  const items: AssignmentHistoryItem[] = [];

  if (mode === "review") {
    const orderedQuestionIds = orderedQuestionIdsFromAttempts(
      mcqRows,
      shortAnswerRows,
      prevCompletedAt,
      completedAt,
    );
    if (orderedQuestionIds.length > 0) {
      const payloadById = await loadQuestionPayloads(
        admin,
        orderedQuestionIds,
        normalizedAssignmentId,
      );
      for (const qid of orderedQuestionIds) {
        const payload = payloadById.get(qid);
        if (!payload) continue;
        items.push({
          question: payload,
          answer: buildHistoryAnswerForQuestion(
            payload,
            mcqLatest.get(qid),
            saqByQuestion.get(qid),
          ),
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
      const qid = String(row.question_id);
      items.push({
        question: payload,
        answer: buildHistoryAnswerForQuestion(
          payload,
          mcqLatest.get(qid),
          saqByQuestion.get(qid),
        ),
      });
    }
  }

  const summary = summarizeHistoryItems(items);

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
    summary,
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
