import type { SupabaseClient } from "@supabase/supabase-js";

const WEEK_DAYS = 7;

/**
 * Sums `attempts.time_spent_sec` over the last 7 days for attempts that were
 * NOT part of an assignment (assignment_id is null) — i.e. Self-Practice
 * sessions specifically, not assignment or bookmarks-review time. Returns
 * null (not 0) when the query itself fails, so callers can omit the metric
 * instead of showing a misleading zero.
 */
export async function getSelfPracticeWeeklySeconds(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<number | null> {
  const since = new Date();
  since.setDate(since.getDate() - WEEK_DAYS);

  const { data, error } = await supabase
    .from("attempts")
    .select("time_spent_sec")
    .eq("user_id", studentUserId)
    .is("assignment_id", null)
    .gte("answered_at", since.toISOString());

  if (error || !data) return null;

  return data.reduce(
    (sum, row) => sum + (typeof row.time_spent_sec === "number" ? row.time_spent_sec : 0),
    0,
  );
}
