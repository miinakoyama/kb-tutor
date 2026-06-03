import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  resolvePerformanceThresholds,
  type PerformanceThresholds,
} from "@/lib/analytics/constants";

export interface ThresholdsRow {
  user_id: string;
  student_basic_min: number;
  student_proficient_min: number;
  student_advanced_min: number;
  standard_basic_min: number;
  standard_proficient_min: number;
  standard_advanced_min: number;
  updated_at: string;
}

export function rowToThresholds(row: ThresholdsRow): PerformanceThresholds {
  return resolvePerformanceThresholds({
    basicMin: row.student_basic_min,
    proficientMin: row.student_proficient_min,
    advancedMin: row.student_advanced_min,
  });
}

/**
 * Load the persisted thresholds for `userId`. Returns the system defaults
 * (and `isCustom = false`) when the teacher has not configured an override.
 * Reads through the service-role client so it works from any server context.
 */
export async function loadTeacherThresholds(userId: string): Promise<{
  thresholds: PerformanceThresholds;
  isCustom: boolean;
}> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("teacher_performance_thresholds")
    .select(
      "user_id,student_basic_min,student_proficient_min,student_advanced_min,standard_basic_min,standard_proficient_min,standard_advanced_min,updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[performance-thresholds] failed to load row", error);
    return { thresholds: DEFAULT_PERFORMANCE_THRESHOLDS, isCustom: false };
  }
  if (!data) {
    return { thresholds: DEFAULT_PERFORMANCE_THRESHOLDS, isCustom: false };
  }
  return { thresholds: rowToThresholds(data as ThresholdsRow), isCustom: true };
}
