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
 * Side-effects in order. Note this ordering is load-bearing: the cap
 * check runs BEFORE we mutate `assignment_targets.last_completed_at`, so
 * a rejected completion (e.g. 409 max_attempts_exceeded) never advances
 * the student's "completed" timestamp.
 *   1. Validate access (existing assignment_targets row OR school membership).
 *   2. Compute the next attempt_number for (assignment, student) by counting
 *      existing `assignment_completions` rows (and back-filling a synthetic
 *      legacy row for pre-history-table completions). Enforce
 *      `assignments.max_attempts` if set — if the next attempt would
 *      exceed the cap, reject with 409 BEFORE writing any new state.
 *   3. Insert the new `assignment_completions` row, using the first
 *      post-prior-completion attempt as `started_at` (or assignment creation
 *      time as a fallback for sessions with no recorded attempts).
 *   4. Insert/update `assignment_targets.last_completed_at` so the existing
 *      resume and "Completed" surfaces keep working.
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

  // Access check: caller must either already have an assignment_targets
  // row for this assignment OR be a current member of the assignment's
  // school. We deliberately do NOT mutate target state here yet — that
  // is deferred until after the max_attempts cap check below so a 409
  // rejection cannot advance `last_completed_at` for the student.
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
    // Pre-validate the precondition needed to insert a fresh
    // assignment_targets row below. Doing this up-front avoids the
    // dangling state of an inserted assignment_completions row paired
    // with no assignment_targets row when `created_at` is missing.
    if (!assignment.created_at) {
      return NextResponse.json(
        { error: "Assignment is missing created_at" },
        { status: 500 },
      );
    }
  }

  // Determine attempt_number for the new completion row by counting how many
  // completions already exist for this (student, assignment). We do this
  // *before* enforcing max_attempts so a student gets the same answer
  // whether their previous-attempt totals are exactly at the cap or beyond
  // it (e.g. an admin lowered the cap after the fact).
  const { count: rawCompletionsCount, error: countError } = await admin
    .from("assignment_completions")
    .select("id", { count: "exact", head: true })
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", user.id);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }

  // Legacy backfill: students who completed this assignment before the
  // `assignment_completions` table existed have a non-null
  // `assignment_targets.last_completed_at` but zero history rows. Without
  // this, max_attempts enforcement would treat them as having zero prior
  // attempts and silently grant an extra run beyond the configured cap
  // (e.g. max_attempts = 1 would still let a legacy student submit a
  // brand new "attempt 1"). Insert a synthetic row representing that
  // pre-history completion so the count, the cap check, and the per-
  // attempt history view all agree. The backfill is independent of the
  // current submission: it represents a completion that already
  // happened, so we keep it even if the cap check below rejects the
  // new attempt.
  let effectivePriorCompletions = rawCompletionsCount ?? 0;
  if (effectivePriorCompletions === 0 && priorLastCompletedAt) {
    const { error: backfillError } = await admin
      .from("assignment_completions")
      .insert({
        assignment_id: normalizedAssignmentId,
        student_user_id: user.id,
        attempt_number: 1,
        started_at: priorLastCompletedAt,
        completed_at: priorLastCompletedAt,
      });
    if (backfillError) {
      // A concurrent backfill from another request may already have
      // written this exact legacy row; the (assignment_id,
      // student_user_id, attempt_number) unique constraint surfaces that
      // as Postgres error 23505, which is safe to swallow — both writers
      // converge on the same state.
      const code = (backfillError as { code?: string }).code;
      if (code !== "23505") {
        return NextResponse.json(
          { error: backfillError.message },
          { status: 400 },
        );
      }
    }
    effectivePriorCompletions = 1;
  }

  const attemptNumber = effectivePriorCompletions + 1;
  const maxAttempts =
    typeof assignment.max_attempts === "number" && assignment.max_attempts > 0
      ? assignment.max_attempts
      : null;
  if (maxAttempts !== null && attemptNumber > maxAttempts) {
    // Reject BEFORE touching assignment_targets.last_completed_at so the
    // student's completion timestamp is not advanced for a denied run.
    return NextResponse.json(
      {
        error: "Maximum attempts exceeded for this assignment.",
        code: "max_attempts_exceeded",
        max_attempts: maxAttempts,
        completed_attempts: effectivePriorCompletions,
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

  // Persist the new `last_completed_at` only now that the cap check has
  // passed AND the immutable completion row has been recorded. This
  // ordering ensures that a 409 (or any earlier failure) cannot leave the
  // student's target pointing at a "completed" timestamp for a run that
  // was actually denied or never persisted.
  if (!targetRow) {
    // Membership and `created_at` were both verified above before any
    // writes, so this insert is safe to issue now that the completion
    // row exists.
    const assignmentCreatedAt = assignment.created_at as string;
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
