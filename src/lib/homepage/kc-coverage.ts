import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStandardsForModule, type ModuleCode } from "@/lib/standards";
import { getKCsByStandard } from "@/lib/short-answer/generation/data";
import { PROGRESS_TOPICS } from "@/lib/progress/mastery";

export type TopicKcCoverage = {
  key: string;
  module: ModuleCode;
  category: string;
  /** Distinct KC codes practiced (>=1 attempt on a question tagged with that KC). */
  practicedCount: number;
  /** Total KC codes that exist for this topic's standards, per the KC catalog. */
  totalCount: number;
};

/**
 * KC practice coverage per topic (module + category), in curriculum order.
 *
 * Caveat: `attempts` has no kc_code column, so "practiced" is derived by
 * joining attempted question ids to generated_questions.payload->>kcCode.
 * Only questions generated with a single-standard KC anchor carry a kcCode
 * (see pickKC() in the generate-questions route), so this undercounts —
 * a topic can read as having fewer KCs practiced than the student has
 * actually covered, if the underlying questions were never KC-tagged.
 */
export async function getTopicKcCoverage(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<TopicKcCoverage[]> {
  // Build the topic -> KC code set map from the static curriculum catalog.
  // This denominator is reliable — it doesn't depend on attempt data.
  const kcCodesByTopic = new Map<string, Set<string>>();
  for (const { key, module, category } of PROGRESS_TOPICS) {
    const standards = getStandardsForModule(module).filter(
      (standard) => standard.category === category,
    );
    const codes = new Set<string>();
    for (const standard of standards) {
      for (const kc of getKCsByStandard(standard.id)) {
        codes.add(kc.code);
      }
    }
    kcCodesByTopic.set(key, codes);
  }

  const practicedKcCodes = await getPracticedKcCodes(supabase, studentUserId);

  return PROGRESS_TOPICS.map(({ key, module, category }) => {
    const topicKcCodes = kcCodesByTopic.get(key) ?? new Set<string>();
    let practicedCount = 0;
    for (const code of topicKcCodes) {
      if (practicedKcCodes.has(code)) practicedCount += 1;
    }
    return {
      key,
      module,
      category,
      practicedCount,
      totalCount: topicKcCodes.size,
    };
  });
}

async function getPracticedKcCodes(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<Set<string>> {
  const { data: attemptRows, error: attemptsError } = await supabase
    .from("attempts")
    .select("question_id")
    .eq("user_id", studentUserId);
  if (attemptsError || !attemptRows) return new Set();

  const questionIds = Array.from(
    new Set(
      attemptRows
        .map((row) => (typeof row.question_id === "string" ? row.question_id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (questionIds.length === 0) return new Set();

  // generated_questions has no safe student-scoped RLS policy (rows are
  // owned by the teacher who generated them), so this needs the admin
  // client — same pattern as getStudentAssignmentList().
  const admin = createSupabaseAdminClient();
  const { data: questionRows, error: questionsError } = await admin
    .from("generated_questions")
    .select("id, kcCode:payload->>kcCode")
    .in("id", questionIds);
  if (questionsError || !questionRows) return new Set();

  const codes = new Set<string>();
  for (const row of questionRows) {
    const code = (row as { kcCode?: unknown }).kcCode;
    if (typeof code === "string" && code.trim()) codes.add(code.trim());
  }
  return codes;
}
