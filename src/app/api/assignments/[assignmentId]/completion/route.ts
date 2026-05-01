import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countIncompleteEnrolledAssignmentsForStudent } from "@/lib/assignment-school-completion";

/**
 * Mark the current student's assignment_target as completed. Called by the
 * client when the student reaches the summary (i.e. finishes every question
 * in a practice/exam session, or finishes a review run).
 *
 * The value is stored per (assignment_id, student_user_id) in
 * assignment_targets.last_completed_at and is used for:
 *   - showing a "Completed" badge on the student's assignment list
 *   - scoping the resume-answered map so that Restart yields a fresh session
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

  // Resolve the assignment so we can authorize students who weren't
  // originally targeted but joined the school afterwards.
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,school_id,created_at")
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
    .select("assignment_id")
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", user.id)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }

  const completedAt = new Date().toISOString();

  if (!targetRow) {
    // Authorize via school membership, then create the target row so we
    // have a place to record last_completed_at.
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

    // Split from the old upsert: when backfilling a missing target row for a
    // late-joined student, pin created_at to the assignment's own created_at
    // instead of letting Postgres default to now(). Otherwise the
    // notification timeline would treat the first completion as the moment
    // the assignment was assigned, which is semantically wrong.
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

  const { total, incomplete, error: countError } =
    await countIncompleteEnrolledAssignmentsForStudent(admin, user.id);
  const allAssignmentsCompleted =
    !countError && total > 0 && incomplete === 0;

  return NextResponse.json({
    ok: true,
    last_completed_at: completedAt,
    all_assignments_completed: allAssignmentsCompleted,
  });
}
