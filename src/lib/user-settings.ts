import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_APP_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

export interface StudentUserSettings {
  timeZone: string;
}

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
