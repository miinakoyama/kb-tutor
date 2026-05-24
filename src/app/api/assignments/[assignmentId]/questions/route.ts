import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import {
  deterministicShuffle,
  resolveReviewQuestionsForAssignment,
} from "@/lib/student-assignments";
import {
  buildAnsweredMap,
  collectQuestionIds,
  type AnsweredMap,
} from "@/lib/assignments/answered-map";
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
    .select("id,school_id,mode,randomize_order,max_attempts")
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

  // A student gets access if they were explicitly targeted *or* they are a
  // current member of the assignment's school. The latter covers students
  // who joined after the assignment was created.
  let canAccess = Boolean(targetRow);
  if (!canAccess) {
    const { data: memberRow, error: memberError } = await admin
      .from("school_members")
      .select("school_id")
      .eq("school_id", assignment.school_id)
      .eq("student_user_id", requester.id)
      .maybeSingle();
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }
    canAccess = Boolean(memberRow);
  }
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

  // Enforce max_attempts before serving any questions. We *allow* the
  // student to keep working on their current in-progress run (so a
  // teacher lowering the cap mid-session doesn't strand them), but block
  // a fresh restart once they've already completed `max_attempts` runs.
  // The completion API enforces the same cap as defense in depth.
  //
  // "In-progress" means there is at least one row in `attempts` answered
  // strictly after `last_completed_at` — i.e. the student has already
  // started a new run that hasn't been finalized via the completion API.
  // We cannot rely on `last_completed_at === null` alone because that
  // flag stays non-null forever after the very first completion; without
  // the attempts probe, a returning student who is mid-second-run would
  // be incorrectly 403'd the moment the teacher tightened the cap.
  const maxAttempts =
    typeof assignment.max_attempts === "number" && assignment.max_attempts > 0
      ? assignment.max_attempts
      : null;
  let completedAttempts = 0;
  if (maxAttempts !== null) {
    const { count: prior, error: priorError } = await admin
      .from("assignment_completions")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", normalizedAssignmentId)
      .eq("student_user_id", requester.id);
    if (priorError) {
      return NextResponse.json({ error: priorError.message }, { status: 400 });
    }
    completedAttempts = prior ?? 0;
    if (completedAttempts >= maxAttempts && lastCompletedAt) {
      let hasInProgressRun = false;
      const { data: inProgressRows, error: inProgressError } = await admin
        .from("attempts")
        .select("answered_at")
        .eq("assignment_id", normalizedAssignmentId)
        .eq("user_id", requester.id)
        .gt("answered_at", lastCompletedAt)
        .limit(1);
      if (inProgressError) {
        return NextResponse.json(
          { error: inProgressError.message },
          { status: 400 },
        );
      }
      hasInProgressRun = (inProgressRows ?? []).length > 0;

      if (!hasInProgressRun) {
        return NextResponse.json(
          {
            error: "Maximum attempts reached for this assignment.",
            code: "max_attempts_exceeded",
            max_attempts: maxAttempts,
            completed_attempts: completedAttempts,
          },
          { status: 403 },
        );
      }
    }
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
  let answered: AnsweredMap = {};

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

    const questionIds = collectQuestionIds(questions);
    if (questionIds.length > 0) {
      const { data: attemptRows } = await admin
        .from("attempts")
        .select("question_id,selected_option_id,is_correct,answered_at")
        .eq("user_id", requester.id)
        .eq("assignment_id", normalizedAssignmentId)
        .in("question_id", questionIds)
        .order("answered_at", { ascending: true });
      answered = buildAnsweredMap(attemptRows ?? [], { lastCompletedAt });
    }
  }

  return NextResponse.json({
    questions,
    mode: assignmentMode,
    randomize_order: randomizeOrder,
    answered,
    last_completed_at: lastCompletedAt,
    max_attempts: maxAttempts,
    completed_attempts: completedAttempts,
  });
}
