import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/assignments/[assignmentId]/history
 *
 * Returns the current student's completed runs of this assignment, oldest
 * first by attempt_number. Each row carries summary numbers so the list page
 * can render without fetching per-attempt details until the student opens one.
 *
 * Access: students see only their own runs. Teachers/admins are intentionally
 * routed through a separate teacher analytics surface; this endpoint is the
 * student-facing one and always scopes to `auth.uid()`.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assignmentId } = await context.params;
  const normalizedAssignmentId = assignmentId?.trim();
  if (!normalizedAssignmentId) {
    return NextResponse.json({ error: "Missing assignment id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,title,school_id,mode,max_attempts")
    .eq("id", normalizedAssignmentId)
    .maybeSingle();
  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  // Access check mirrors the questions endpoint: explicit target row OR
  // current school membership is enough. Admin-only debug paths are not
  // needed here.
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

  const { data: completions, error: completionsError } = await admin
    .from("assignment_completions")
    .select("attempt_number,started_at,completed_at")
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", user.id)
    .order("attempt_number", { ascending: true });
  if (completionsError) {
    return NextResponse.json({ error: completionsError.message }, { status: 400 });
  }

  const completionRows = completions ?? [];

  // We need per-run summary numbers. Group all attempts for this
  // (student, assignment) by completion windows. Within a window
  // (prevCompletedAt, completedAt], take the LATEST attempt per question_id
  // — matches the resume-map semantic used elsewhere — and count correct.
  const { data: attempts, error: attemptsError } = await admin
    .from("attempts")
    .select("question_id,selected_option_id,is_correct,answered_at")
    .eq("assignment_id", normalizedAssignmentId)
    .eq("user_id", user.id)
    .order("answered_at", { ascending: true });
  if (attemptsError) {
    return NextResponse.json({ error: attemptsError.message }, { status: 400 });
  }

  const attemptRows = attempts ?? [];

  // For practice/exam assignments the total is the number of snapshot
  // questions, NOT just the count of distinct answered questions in the
  // window. Otherwise an exam submitted with unanswered items would
  // report e.g. 8/8 in this list view while the detail view (which is
  // driven by the snapshot) shows 8/10 — students would see an
  // inflated percentage on the history page until they drilled in.
  // Review mode has no snapshot, so we keep the per-run answered count.
  const assignmentMode = String(assignment.mode ?? "practice");
  let snapshotQuestionCount = 0;
  if (assignmentMode !== "review") {
    const { count: snapshotCount, error: snapshotCountError } = await admin
      .from("assignment_question_snapshots")
      .select("question_id", { count: "exact", head: true })
      .eq("assignment_id", normalizedAssignmentId);
    if (snapshotCountError) {
      return NextResponse.json(
        { error: snapshotCountError.message },
        { status: 400 },
      );
    }
    snapshotQuestionCount = snapshotCount ?? 0;
  }

  type Summary = { correct: number; total: number };
  const summaries: Summary[] = completionRows.map(() => ({ correct: 0, total: 0 }));

  for (let i = 0; i < completionRows.length; i += 1) {
    const row = completionRows[i];
    const prevCompletedAt =
      i > 0 ? String(completionRows[i - 1].completed_at) : null;
    const completedAt = String(row.completed_at);
    const prevMs = prevCompletedAt ? new Date(prevCompletedAt).getTime() : -Infinity;
    const endMs = new Date(completedAt).getTime();
    // Latest attempt per question_id within this window
    const latestByQuestion = new Map<
      string,
      { isCorrect: boolean; answeredAt: number }
    >();
    for (const attempt of attemptRows) {
      const answeredAt =
        typeof attempt.answered_at === "string" ? attempt.answered_at : null;
      if (!answeredAt) continue;
      const ms = new Date(answeredAt).getTime();
      if (Number.isNaN(ms) || ms <= prevMs || ms > endMs) continue;
      const qid = String(attempt.question_id);
      const prior = latestByQuestion.get(qid);
      if (!prior || ms >= prior.answeredAt) {
        latestByQuestion.set(qid, {
          isCorrect: Boolean(attempt.is_correct),
          answeredAt: ms,
        });
      }
    }
    let correct = 0;
    for (const entry of latestByQuestion.values()) {
      if (entry.isCorrect) correct += 1;
    }
    // For practice/exam: prefer the snapshot count so unanswered
    // questions are still part of the denominator. Fall back to the
    // window-answered count when the snapshot is empty (legacy data),
    // which preserves the prior behavior for that edge case.
    const windowTotal = latestByQuestion.size;
    const total =
      assignmentMode === "review"
        ? windowTotal
        : snapshotQuestionCount > 0
          ? snapshotQuestionCount
          : windowTotal;
    summaries[i] = { correct, total };
  }

  const maxAttempts =
    typeof assignment.max_attempts === "number" && assignment.max_attempts > 0
      ? assignment.max_attempts
      : null;

  return NextResponse.json({
    assignment: {
      id: String(assignment.id),
      title: String(assignment.title),
      mode: String(assignment.mode ?? "practice"),
      max_attempts: maxAttempts,
    },
    attempts: completionRows.map((row, index) => ({
      attempt_number: Number(row.attempt_number),
      started_at: String(row.started_at),
      completed_at: String(row.completed_at),
      correct_count: summaries[index].correct,
      total_count: summaries[index].total,
    })),
  });
}
