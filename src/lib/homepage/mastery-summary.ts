import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateKcMastery,
  type ActiveKc,
  type MasteryDatum,
} from "@/lib/progress/mastery";

/**
 * Server-side topic-mastery data for the homepage profile radar, fetched with
 * the auth-scoped server client so the chart is in the initial render —
 * previously the ProfileCard fetched this from the browser on mount, causing
 * a loading flash and a second round trip.
 *
 * Mastery is each topic's active KCs averaged by BKT probability
 * (`calculateKcMastery`), not raw attempt accuracy, so it reflects the same
 * signal the adaptive selector uses to decide what a student still needs to
 * practice.
 */

/** Radar axis labels — the full module/category names don't fit the chart. */
const TOPIC_SHORT_LABELS: Record<string, string> = {
  "Module A - Structure and Function": "Structure",
  "Module A - Matter and Energy in Organisms and Ecosystems": "Matter",
  "Module A - Interdependent Relationships in Ecosystems": "Ecosystems I",
  "Module B - Inheritance and Variation of Traits": "Inheritance",
  "Module B - Interdependent Relationships in Ecosystems": "Ecosystems II",
  "Module B - Natural Selection and Evolution": "Evolution",
};

function withShortLabels(data: MasteryDatum[]): MasteryDatum[] {
  return data.map((d) => ({
    ...d,
    topic: TOPIC_SHORT_LABELS[d.topic] ?? d.topic,
  }));
}

/**
 * Mastery per topic, derived from every active KC's current BKT probability.
 * A failed query degrades to the all-zero "insufficient data" shape
 * (`calculateKcMastery([], new Map())`) — the radar renders its empty frame
 * rather than the card erroring out.
 */
export async function getMasterySummary(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<MasteryDatum[]> {
  const [kcResult, masteryResult] = await Promise.all([
    supabase.from("knowledge_components").select("code,standard_id").eq("active", true),
    supabase.from("student_kc_mastery").select("kc_code,probability").eq("user_id", studentUserId),
  ]);

  if (kcResult.error || !kcResult.data || masteryResult.error) {
    return withShortLabels(calculateKcMastery([], new Map()));
  }

  const activeKcs: ActiveKc[] = kcResult.data.map((row) => ({
    code: String(row.code),
    standardId: String(row.standard_id),
  }));
  const probabilityByKcCode = new Map(
    (masteryResult.data ?? []).map((row) => [String(row.kc_code), Number(row.probability)]),
  );

  return withShortLabels(calculateKcMastery(activeKcs, probabilityByKcCode));
}
