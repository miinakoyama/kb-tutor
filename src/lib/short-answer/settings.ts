/**
 * Resolves the effective short-answer feedback configuration for a student at
 * grading time (FR-026). Order: the student's school row → the system default
 * row → a hardcoded fallback. Multi-school students use their most recent
 * `school_members` membership.
 *
 * Reads use the service-role client because students have no RLS access to
 * `feedback_settings`. Server-side only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isGradingMethod,
  isValidTemperature,
  findGradingModelById,
} from "@/lib/llm/models";
import type { GradingMethod, GradingModelConfig } from "@/types/short-answer";

/** Hardcoded fallback when no school or default row exists (data-model §3). */
export const HARDCODED_FALLBACK: GradingModelConfig = {
  method: "2",
  modelId: "gpt-5.4",
  temperature: 1,
};

interface FeedbackSettingsRow {
  scope: "school" | "default";
  school_id: string | null;
  method: string;
  model_id: string;
  temperature: number | string;
}

function toConfig(row: FeedbackSettingsRow | null): GradingModelConfig | null {
  if (!row) return null;
  const method = row.method;
  const temperature = Number(row.temperature);
  if (!isGradingMethod(method)) return null;
  if (!isValidTemperature(temperature)) return null;
  if (!findGradingModelById(row.model_id)) return null;
  return { method: method as GradingMethod, modelId: row.model_id, temperature };
}

async function mostRecentSchoolId(
  admin: SupabaseClient,
  studentUserId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("school_members")
    .select("school_id, created_at")
    .eq("student_user_id", studentUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.school_id as string | undefined) ?? null;
}

export async function resolveFeedbackConfig(
  studentUserId: string,
): Promise<GradingModelConfig> {
  const admin = createSupabaseAdminClient();

  const schoolId = await mostRecentSchoolId(admin, studentUserId);
  if (schoolId) {
    const { data } = await admin
      .from("feedback_settings")
      .select("scope, school_id, method, model_id, temperature")
      .eq("scope", "school")
      .eq("school_id", schoolId)
      .maybeSingle();
    const schoolConfig = toConfig(data as FeedbackSettingsRow | null);
    if (schoolConfig) return schoolConfig;
  }

  const { data: defaultRow } = await admin
    .from("feedback_settings")
    .select("scope, school_id, method, model_id, temperature")
    .eq("scope", "default")
    .maybeSingle();
  const defaultConfig = toConfig(defaultRow as FeedbackSettingsRow | null);
  if (defaultConfig) return defaultConfig;

  return HARDCODED_FALLBACK;
}
