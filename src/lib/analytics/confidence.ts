import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  appendPage,
  chunkArray,
} from "@/lib/analytics/pagination";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type ConfidenceLevelKey = "not_sure" | "somewhat" | "sure";

/**
 * The four-quadrant "confidence check" used on the teacher standard-detail
 * page: students self-report confidence (mapped to high="sure" / low="not_sure"
 * or "somewhat") alongside whether their answer was correct.
 *
 *  - mastery: high confidence + correct (genuine mastery)
 *  - misconception: high confidence + wrong (priority misconception — needs intervention)
 *  - fragile: low confidence + correct (fragile understanding — may fail under pressure)
 *  - expected: low confidence + wrong (expected gap — normal)
 */
export interface ConfidenceQuadrantCounts {
  mastery: number;
  misconception: number;
  fragile: number;
  expected: number;
  total: number;
}

export interface ConfidenceQuadrantPercents {
  mastery: number;
  misconception: number;
  fragile: number;
  expected: number;
  total: number;
}

const MAX_CONFIDENCE_ROWS = 100_000;

export function emptyConfidenceQuadrantCounts(): ConfidenceQuadrantCounts {
  return { mastery: 0, misconception: 0, fragile: 0, expected: 0, total: 0 };
}

export function parseConfidenceLevel(value: unknown): ConfidenceLevelKey | null {
  if (value === "not_sure" || value === "somewhat" || value === "sure") {
    return value;
  }
  return null;
}

/**
 * Classify a single confidence submission into one of the four quadrants.
 * "sure" is treated as high confidence; "not_sure" / "somewhat" as low.
 */
export function classifyConfidenceQuadrant(
  level: ConfidenceLevelKey,
  isCorrect: boolean,
): keyof Omit<ConfidenceQuadrantCounts, "total"> {
  const isHighConfidence = level === "sure";
  if (isHighConfidence) return isCorrect ? "mastery" : "misconception";
  return isCorrect ? "fragile" : "expected";
}

export function addConfidenceSubmission(
  counts: ConfidenceQuadrantCounts,
  level: ConfidenceLevelKey,
  isCorrect: boolean,
): void {
  counts[classifyConfidenceQuadrant(level, isCorrect)] += 1;
  counts.total += 1;
}

export function toConfidenceQuadrantPercents(
  counts: ConfidenceQuadrantCounts,
): ConfidenceQuadrantPercents {
  if (counts.total === 0) {
    return { mastery: 0, misconception: 0, fragile: 0, expected: 0, total: 0 };
  }
  const pct = (n: number) => Math.round((n / counts.total) * 100);
  return {
    mastery: pct(counts.mastery),
    misconception: pct(counts.misconception),
    fragile: pct(counts.fragile),
    expected: pct(counts.expected),
    total: counts.total,
  };
}

interface ConfidenceEventRow {
  user_id: string;
  question_id: string | null;
  payload: { confidenceLevel?: unknown; isCorrect?: unknown } | null;
}

/**
 * Fetch `confidence_submitted` analytics events for the given users and
 * questions, paginated and chunked to stay within Supabase's `.in()` limits.
 */
export async function fetchConfidenceEvents(
  admin: SupabaseAdminClient,
  userIds: string[],
  questionIds: string[],
): Promise<{ data: ConfidenceEventRow[]; error: string | null }> {
  const data: ConfidenceEventRow[] = [];

  for (const userChunk of chunkArray(userIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (const questionChunk of chunkArray(questionIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
      for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
        const { data: page, error } = await admin
          .from("analytics_events")
          .select("user_id,question_id,payload")
          .eq("event_type", "confidence_submitted")
          .in("user_id", userChunk)
          .in("question_id", questionChunk)
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + ANALYTICS_PAGE_SIZE - 1);
        if (error) return { data: [], error: error.message };
        const rows = (page ?? []) as ConfidenceEventRow[];
        const capError = appendPage(data, rows, MAX_CONFIDENCE_ROWS);
        if (capError) return { data: [], error: capError };
        if (rows.length < ANALYTICS_PAGE_SIZE) break;
      }
    }
  }

  return { data, error: null };
}
