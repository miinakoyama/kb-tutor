import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentAssignmentListItem = {
  id: string;
  title: string;
  due_date?: string | null;
  topics: string[];
  target_minutes: number;
};

export type StudentAssignmentListResult = {
  assignments: StudentAssignmentListItem[];
  error: string | null;
};

async function fetchAssignmentList(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<StudentAssignmentListResult> {
  const { data: targetRows, error: targetsError } = await supabase
    .from("assignment_targets")
    .select("assignment_id, created_at")
    .eq("student_user_id", studentUserId)
    .order("created_at", { ascending: false });

  if (targetsError) {
    return { assignments: [], error: targetsError.message };
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const row of targetRows ?? []) {
    if (seen.has(row.assignment_id)) continue;
    seen.add(row.assignment_id);
    orderedIds.push(row.assignment_id);
  }

  if (orderedIds.length === 0) {
    return { assignments: [], error: null };
  }

  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from("assignments")
    .select("id,title,due_date,module_ids,topics,target_minutes")
    .in("id", orderedIds);

  if (assignmentsError) {
    return { assignments: [], error: assignmentsError.message };
  }

  const byId = new Map(
    ((assignmentRows ?? []) as StudentAssignmentListItem[]).map((a) => [
      a.id,
      a,
    ]),
  );
  const assignments = orderedIds
    .map((id) => byId.get(id))
    .filter((a): a is StudentAssignmentListItem => a != null);

  return { assignments, error: null };
}

/**
 * Loads assignments targeted at the student. Mirrors getStudentNotifications:
 * if the auth-scoped client hits an RLS or PostgREST error, retries with the
 * service role so the My Assignment page stays consistent with Home/Notifications.
 */
export async function getStudentAssignmentList(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<StudentAssignmentListResult> {
  let result = await fetchAssignmentList(supabase, studentUserId);
  if (result.error) {
    try {
      const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
      const adminClient = createSupabaseAdminClient();
      const adminResult = await fetchAssignmentList(adminClient, studentUserId);
      if (!adminResult.error) {
        result = adminResult;
      }
    } catch {
      // keep original error
    }
  }
  return result;
}
