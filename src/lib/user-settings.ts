import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_APP_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

export interface StudentUserSettings {
  timeZone: string;
  notificationsLastReadAt: string | null;
}

/**
 * Loads the subset of `user_settings` fields that student-facing pages
 * (Home, Notifications) need for rendering.
 *
 * Each column is fetched in its own query so that a missing column in a
 * legacy environment (for example `time_zone` before its migration has
 * reached that DB, or `notifications_last_read_at` before the rollout
 * migration lands) cannot poison the sibling read. Any PostgREST error
 * simply falls back to the defaults — `DEFAULT_APP_TIME_ZONE` and `null`
 * respectively.
 */
export async function getStudentUserSettings(
  supabase: SupabaseClient,
): Promise<StudentUserSettings> {
  const [{ data: timeZoneRow }, { data: notifReadRow }] = await Promise.all([
    supabase.from("user_settings").select("time_zone").maybeSingle(),
    supabase
      .from("user_settings")
      .select("notifications_last_read_at")
      .maybeSingle(),
  ]);

  return {
    timeZone: normalizeTimeZone(
      timeZoneRow?.time_zone,
      DEFAULT_APP_TIME_ZONE,
    ),
    notificationsLastReadAt:
      notifReadRow?.notifications_last_read_at ?? null,
  };
}
