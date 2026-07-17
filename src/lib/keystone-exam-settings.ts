import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Saves the student's personal Keystone exam date (their countdown override;
 * the school-level date stays untouched). `null` clears the override so the
 * school default applies again. Same browser-upsert pattern as
 * `saveTimeZoneToDb` — user_settings has self-all RLS.
 *
 * Returns false when the write failed so the caller can keep the editor
 * open instead of pretending the save happened.
 */
export async function saveKeystoneExamDateToDb(
  examDate: string | null,
): Promise<boolean> {
  if (typeof window === "undefined" || !hasSupabaseEnv()) return false;
  if (examDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return false;
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from("user_settings")
      .upsert({ keystone_exam_date: examDate }, { onConflict: "user_id" });
    return !error;
  } catch {
    return false;
  }
}
