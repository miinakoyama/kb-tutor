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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const completedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("assignment_targets")
    .update({ last_completed_at: completedAt })
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", user.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, last_completed_at: completedAt });
}
