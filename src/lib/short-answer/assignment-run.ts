import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The assignment run boundary for short-answer attempts: the student's
 * `assignment_targets.last_completed_at` at the time this run started.
 * NULL means the first run (no prior completion).
 */
export async function resolveAssignmentRunAfter(
  supabase: SupabaseClient,
  assignmentId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("assignment_targets")
    .select("last_completed_at")
    .eq("assignment_id", assignmentId)
    .eq("student_user_id", userId)
    .maybeSingle();
  const value = data?.last_completed_at;
  return typeof value === "string" && value.length > 0 ? value : null;
}

type RunFilterQuery = {
  eq: (column: string, value: string) => RunFilterQuery;
  is: (column: string, value: null) => RunFilterQuery;
  gt: (column: string, value: string) => RunFilterQuery;
};

/**
 * Limit short_answer_attempts queries to the current assignment run.
 * Retry runs use answered_at > last_completed_at so prior-run rows are excluded
 * even when legacy rows have assignment_run_after = NULL.
 */
export function applyAssignmentRunFilter<T>(
  query: T,
  assignmentId: string | null | undefined,
  assignmentRunAfter: string | null | undefined,
): T {
  const filterable = query as RunFilterQuery;
  if (!assignmentId) return query;
  if (assignmentRunAfter) {
    return filterable.gt("answered_at", assignmentRunAfter) as T;
  }
  return filterable.is("assignment_run_after", null) as T;
}
