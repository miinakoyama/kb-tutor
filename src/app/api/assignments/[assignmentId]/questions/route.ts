import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import {
  deterministicShuffle,
  resolveReviewQuestionsForAssignment,
} from "@/lib/student-assignments";
import type { Question } from "@/types/question";

async function getRequester() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);

  return { id: user.id, role };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
) {
  const requester = await getRequester();
  if (!requester) {
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
    .select("id,school_id,mode,randomize_order")
    .eq("id", normalizedAssignmentId)
    .maybeSingle();
  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const { data: targetRow, error: targetError } = await admin
    .from("assignment_targets")
    .select("assignment_id,last_completed_at")
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", requester.id)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }

  // Scope the "answered" map used for resume to attempts strictly after
  // last_completed_at, so that a Restart after completion yields a fresh
  // session without having to delete prior attempt history.
  const lastCompletedAt =
    (targetRow?.last_completed_at as string | null | undefined) ?? null;

  let canAccess = Boolean(targetRow);
  if (!canAccess && ["teacher", "admin"].includes(requester.role ?? "")) {
    if (requester.role === "admin") {
      canAccess = true;
    } else {
      const [{ data: teacherSchool }, { data: schoolTeacherRow }] = await Promise.all([
        admin
          .from("schools")
          .select("id")
          .eq("id", assignment.school_id)
          .eq("teacher_user_id", requester.id)
          .maybeSingle(),
        admin
          .from("school_teachers")
          .select("school_id")
          .eq("school_id", assignment.school_id)
          .eq("teacher_user_id", requester.id)
          .maybeSingle(),
      ]);
      canAccess = Boolean(teacherSchool || schoolTeacherRow);
    }
  }

  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assignmentMode =
    assignment.mode === "practice" ||
    assignment.mode === "exam" ||
    assignment.mode === "review"
      ? assignment.mode
      : "practice";
  const randomizeOrder = assignment.randomize_order !== false;

  let questions: Question[] = [];
  // answered: question_id -> { selectedOptionId, isCorrect, answeredAt }
  // Used by practice/exam to pre-fill progress and resume from the first
  // unanswered question. Review is dynamic and always starts fresh.
  const answered: Record<
    string,
    { selectedOptionId: string | null; isCorrect: boolean; answeredAt: string }
  > = {};

  if (assignmentMode === "review") {
    const result = await resolveReviewQuestionsForAssignment(
      admin,
      requester.id,
      normalizedAssignmentId,
    );
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    questions = result.questions;
  } else {
    const { data: snapshotRows, error: snapshotError } = await admin
      .from("assignment_question_snapshots")
      .select("payload,order_index")
      .eq("assignment_id", normalizedAssignmentId)
      .order("order_index", { ascending: true });
    if (snapshotError) {
      return NextResponse.json({ error: snapshotError.message }, { status: 400 });
    }
    questions = (snapshotRows ?? [])
      .map((row) => row.payload as Question)
      .filter((payload): payload is Question => Boolean(payload && payload.id));

    if (randomizeOrder) {
      questions = deterministicShuffle(
        questions,
        `${normalizedAssignmentId}::${requester.id}`,
      );
    }

    const questionIds = questions
      .map((q) => q.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (questionIds.length > 0) {
      const { data: attemptRows } = await admin
        .from("attempts")
        .select("question_id,selected_option_id,is_correct,answered_at")
        .eq("user_id", requester.id)
        .eq("assignment_id", normalizedAssignmentId)
        .in("question_id", questionIds)
        .order("answered_at", { ascending: true });
      const lastCompletedMs = lastCompletedAt
        ? new Date(lastCompletedAt).getTime()
        : null;
      for (const row of attemptRows ?? []) {
        const answeredAt = String(row.answered_at ?? "");
        if (!answeredAt) continue;
        if (
          lastCompletedMs !== null &&
          new Date(answeredAt).getTime() <= lastCompletedMs
        ) {
          continue;
        }
        const qid = String(row.question_id);
        // Latest wins: iterating in ascending order means later rows overwrite.
        answered[qid] = {
          selectedOptionId:
            typeof row.selected_option_id === "string"
              ? row.selected_option_id
              : null,
          isCorrect: Boolean(row.is_correct),
          answeredAt,
        };
      }
    }
  }

  return NextResponse.json({
    questions,
    mode: assignmentMode,
    randomize_order: randomizeOrder,
    answered,
    last_completed_at: lastCompletedAt,
  });
}
