import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    .select("id,school_id")
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
  }

  const completedAt = new Date().toISOString();
  const { error: upsertError } = await admin
    .from("assignment_targets")
    .upsert(
      {
        assignment_id: normalizedAssignmentId,
        student_user_id: user.id,
        last_completed_at: completedAt,
      },
      { onConflict: "assignment_id,student_user_id" },
    );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, last_completed_at: completedAt });
}
