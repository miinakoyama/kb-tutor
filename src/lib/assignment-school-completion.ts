import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Counts assignments in `schoolId` that the student has not yet completed
 * (`assignment_targets.last_completed_at` is null or missing row).
 */
export async function countIncompleteSchoolAssignmentsForStudent(
  admin: SupabaseClient,
  schoolId: string,
  studentUserId: string,
): Promise<{ total: number; incomplete: number; error: string | null }> {
  const { data: assignmentRows, error: assignmentsError } = await admin
    .from("assignments")
    .select("id")
    .eq("school_id", schoolId);
  if (assignmentsError) {
    return { total: 0, incomplete: -1, error: assignmentsError.message };
  }
  const assignmentIds = (assignmentRows ?? []).map((r) => String(r.id));
  if (assignmentIds.length === 0) {
    return { total: 0, incomplete: 0, error: null };
  }

  const { data: targetRows, error: targetsError } = await admin
    .from("assignment_targets")
    .select("assignment_id,last_completed_at")
    .eq("student_user_id", studentUserId)
    .in("assignment_id", assignmentIds);
  if (targetsError) {
    return { total: assignmentIds.length, incomplete: -1, error: targetsError.message };
  }

  const completedByAssignmentId = new Map<string, boolean>();
  for (const row of targetRows ?? []) {
    const id = String(row.assignment_id);
    const at = row.last_completed_at as string | null | undefined;
    const done = typeof at === "string" && at.trim().length > 0;
    completedByAssignmentId.set(id, done);
  }

  let incomplete = 0;
  for (const id of assignmentIds) {
    if (!completedByAssignmentId.get(id)) incomplete++;
  }
  return { total: assignmentIds.length, incomplete, error: null };
}
