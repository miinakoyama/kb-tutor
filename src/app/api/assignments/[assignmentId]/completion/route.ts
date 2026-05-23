import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countIncompleteEnrolledAssignmentsForStudent } from "@/lib/assignment-school-completion";

/**
 * Mark the current student's assignment_target as completed and record an
 * `assignment_completions` row so the run can be browsed later. Called by the
 * client when the student reaches the summary (i.e. finishes every question
 * in a practice/exam session, or finishes a review run).
 *
 * Side-effects in order:
 *   1. Validate access (existing assignment_targets row OR school membership).
 *   2. Compute the next attempt_number for (assignment, student) by counting
 *      existing `assignment_completions` rows. Enforce `assignments.max_attempts`
 *      if set — if the next attempt would exceed the cap, reject with 409.
 *   3. Insert the new `assignment_completions` row, using the first
 *      post-prior-completion attempt as `started_at` (or assignment creation
 *      time as a fallback for sessions with no recorded attempts).
 *   4. Update `assignment_targets.last_completed_at` so the existing resume
 *      and "Completed" surfaces keep working.
 */
export async function POST(
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
    return NextResponse.json(
      { error: "Missing assignment id" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,school_id,created_at,max_attempts")
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
    .eq("student_user_id", user.id)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }

  // Snapshot the prior completion timestamp BEFORE we overwrite it. We use
  // this value below to derive `started_at` for the new completion row and to
  // scope the "first attempt in this run" lookup. Reading `targetRow.last_completed_at`
  // again after the update would only ever return the value we just wrote.
  const priorLastCompletedAt =
    (targetRow?.last_completed_at as string | null | undefined) ?? null;

  const completedAt = new Date().toISOString();

  if (!targetRow) {
    const { data: memberRow, error: memberError } = await admin
      .from("school_members")
      .select("school_id")
      .eq("school_id", assignment.school_id)
      .eq("student_user_id", user.id)
      .maybeSingle();
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }
    if (!memberRow) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const assignmentCreatedAt = assignment.created_at as string | null;
    if (!assignmentCreatedAt) {
      return NextResponse.json(
        { error: "Assignment is missing created_at" },
        { status: 500 },
      );
    }
    const { error: insertError } = await admin
      .from("assignment_targets")
      .insert({
        assignment_id: normalizedAssignmentId,
        student_user_id: user.id,
        created_at: assignmentCreatedAt,
        last_completed_at: completedAt,
      });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  } else {
    const { error: updateError } = await admin
      .from("assignment_targets")
      .update({ last_completed_at: completedAt })
      .eq("assignment_id", normalizedAssignmentId)
      .eq("student_user_id", user.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  // Determine attempt_number for the new completion row by counting how many
  // completions already exist for this (student, assignment). We do this
  // *before* enforcing max_attempts so a student gets the same answer
  // whether their previous-attempt totals are exactly at the cap or beyond
  // it (e.g. an admin lowered the cap after the fact).
  const { count: priorCompletions, error: countError } = await admin
    .from("assignment_completions")
    .select("id", { count: "exact", head: true })
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", user.id);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }
  const attemptNumber = (priorCompletions ?? 0) + 1;
  const maxAttempts =
    typeof assignment.max_attempts === "number" && assignment.max_attempts > 0
      ? assignment.max_attempts
      : null;
  if (maxAttempts !== null && attemptNumber > maxAttempts) {
    return NextResponse.json(
      {
        error: "Maximum attempts exceeded for this assignment.",
        code: "max_attempts_exceeded",
        max_attempts: maxAttempts,
        completed_attempts: priorCompletions ?? 0,
      },
      { status: 409 },
    );
  }

  // started_at = earliest attempt after the prior completion (so the run's
  // duration window is meaningful). For the very first completion, fall back
  // to the assignment's created_at — that's the earliest "the student could
  // have started" timestamp we have. We deliberately do NOT use the prior
  // last_completed_at value as started_at because that's BEFORE the run
  // started (see priorLastCompletedAt snapshot above).
  let startedAt: string | null = null;
  {
    let attemptsQuery = admin
      .from("attempts")
      .select("answered_at")
      .eq("assignment_id", normalizedAssignmentId)
      .eq("user_id", user.id);
    if (priorLastCompletedAt) {
      attemptsQuery = attemptsQuery.gt("answered_at", priorLastCompletedAt);
    }
    attemptsQuery = attemptsQuery
      .order("answered_at", { ascending: true })
      .limit(1);
    const { data: firstAttempt, error: firstAttemptError } = await attemptsQuery;
    if (firstAttemptError) {
      return NextResponse.json(
        { error: firstAttemptError.message },
        { status: 400 },
      );
    }
    if (firstAttempt && firstAttempt.length > 0) {
      startedAt = String(firstAttempt[0].answered_at);
    } else {
      // Empty session (e.g. a review run with no missed questions in scope).
      // Use prior completion if present, otherwise the assignment's birth.
      startedAt =
        priorLastCompletedAt ??
        (assignment.created_at as string | null) ??
        completedAt;
    }
  }

  const { error: completionInsertError } = await admin
    .from("assignment_completions")
    .insert({
      assignment_id: normalizedAssignmentId,
      student_user_id: user.id,
      attempt_number: attemptNumber,
      started_at: startedAt,
      completed_at: completedAt,
    });
  if (completionInsertError) {
    return NextResponse.json(
      { error: completionInsertError.message },
      { status: 400 },
    );
  }

  const { total, incomplete, error: allCountError } =
    await countIncompleteEnrolledAssignmentsForStudent(admin, user.id);
  const allAssignmentsCompleted =
    !allCountError && total > 0 && incomplete === 0;

  return NextResponse.json({
    ok: true,
    last_completed_at: completedAt,
    attempt_number: attemptNumber,
    max_attempts: maxAttempts,
    all_assignments_completed: allAssignmentsCompleted,
  });
}
