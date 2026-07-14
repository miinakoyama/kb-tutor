import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateMastery,
  type AttemptRow,
  type MasteryDatum,
} from "@/lib/progress/mastery";

/**
 * Server-side topic-mastery data for the homepage profile radar. Same mastery
 * model as My Progress (`calculateMastery`), fetched with the auth-scoped
 * server client so the chart is in the initial render — previously the
 * ProfileCard fetched this from the browser on mount, causing a loading flash
 * and a second round trip.
 */

const LOOKBACK_DAYS = 365;
const FETCH_LIMIT = 2000;

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
 * Mastery per topic over the last year. A failed query degrades to the
 * all-zero "insufficient data" shape (`calculateMastery([])`) — the radar
 * renders its empty frame rather than the card erroring out.
 */
export async function getMasterySummary(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<MasteryDatum[]> {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const { data, error } = await supabase
    .from("attempts")
    .select("is_correct,answered_at,topic,standard_id")
    .eq("user_id", studentUserId)
    .gte("answered_at", since.toISOString())
    .order("answered_at", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error || !data) return withShortLabels(calculateMastery([]));

  return withShortLabels(calculateMastery(data as AttemptRow[]));
}
