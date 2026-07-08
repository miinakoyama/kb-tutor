import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether a student may work on an assignment: explicit target row or current
 * membership in the assignment's school (covers late-joined students).
 */
export async function canStudentAccessAssignment(
  admin: SupabaseClient,
  studentUserId: string,
  assignmentId: string,
): Promise<boolean> {
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("school_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) return false;

  const { data: targetRow, error: targetError } = await admin
    .from("assignment_targets")
    .select("assignment_id")
    .eq("assignment_id", assignmentId)
    .eq("student_user_id", studentUserId)
    .maybeSingle();
  if (targetError) return false;
  if (targetRow) return true;

  const { data: memberRow, error: memberError } = await admin
    .from("school_members")
    .select("school_id")
    .eq("school_id", assignment.school_id)
    .eq("student_user_id", studentUserId)
    .maybeSingle();
  if (memberError) return false;
  return Boolean(memberRow);
}
