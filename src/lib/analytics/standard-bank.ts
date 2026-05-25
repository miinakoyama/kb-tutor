import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ANALYTICS_PAGE_SIZE,
} from "@/lib/analytics/pagination";
import { parseQuestionStandardId } from "@/lib/analytics/question-preview";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface ListBankQuestionsInput {
  admin: SupabaseAdminClient;
  standardId: string;
}

/**
 * Return the set of distinct `question_id`s in the question bank that
 * are tagged with the given `standardId` (per the latest payload in
 * `generated_questions`).
 *
 * This is the universe the Sample-question modal cycles through. The
 * function does NOT call `assignment_question_snapshots` — questions
 * that exist only as snapshots have already been answered (so they
 * would not be a useful "fresh" warm-up) and the universe is intended
 * to reflect the live bank.
 */
export async function listBankQuestionsForStandard(
  input: ListBankQuestionsInput,
): Promise<string[]> {
  const { admin, standardId } = input;
  const out = new Set<string>();
  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    const { data, error } = await admin
      .from("generated_questions")
      .select("id,payload,updated_at")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + ANALYTICS_PAGE_SIZE - 1);
    if (error) {
      throw new Error(
        `generated_questions query failed: ${error.message}`,
      );
    }
    const rows =
      (data ?? []) as Array<{ id: string; payload: unknown }>;
    for (const row of rows) {
      if (parseQuestionStandardId(row.payload) === standardId) {
        out.add(String(row.id));
      }
    }
    if (rows.length < ANALYTICS_PAGE_SIZE) break;
  }
  // Stable order — deterministic across calls.
  return Array.from(out).sort();
}
