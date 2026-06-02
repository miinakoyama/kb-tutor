import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_APP_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

export interface StudentUserSettings {
  timeZone: string;
}

/**
 * Loads the subset of `user_settings` fields that student-facing pages
 * (Home, Settings) need for rendering.
 *
 * Fetches `time_zone` in isolation so that a missing column in a legacy
 * environment (before its migration has reached that DB) simply falls back
 * to `DEFAULT_APP_TIME_ZONE`.
 */
export async function getStudentUserSettings(
  supabase: SupabaseClient,
): Promise<StudentUserSettings> {
  const { data: timeZoneRow } = await supabase
    .from("user_settings")
    .select("time_zone")
    .maybeSingle();

  return {
    timeZone: normalizeTimeZone(
      timeZoneRow?.time_zone,
      DEFAULT_APP_TIME_ZONE,
    ),
  };
}
