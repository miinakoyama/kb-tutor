import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question, QuestionSet } from "@/types/question";
import { getDefaultStandardForTopic } from "@/lib/standards";

function withStandard(question: Question): Question {
  if (question.standardId) return question;
  const standard = getDefaultStandardForTopic(question.topic);
  return {
    ...question,
    standardId: standard.id,
    standardLabel: standard.label,
  };
}

export type SchoolQuestionSetRow = {
  schoolId: string;
  setId: string;
  setName: string;
  generatedAt: string;
  generationModelId?: string;
  generationModelLabel?: string;
};

type SelfPracticeQuestionRow = {
  id: string;
  set_id: string;
  payload: unknown;
  content_version: string | null;
  set_name: string;
  set_generated_at: string;
  generation_model_id: string | null;
  generation_model_label: string | null;
};

/**
 * Questions for students: sets linked to a school they attend, with per-question SP flag.
 *
 * Uses the `get_self_practice_questions` RPC (SECURITY DEFINER) instead of a
 * direct select: per-row RLS on `generated_questions` evaluates nested
 * EXISTS/helper-function checks for every row and hits the statement timeout
 * on production data volumes.
 */
export async function fetchStudentSelfPracticeQuestions(
  supabase: SupabaseClient,
): Promise<{ questions: Question[]; questionSets: QuestionSet[] }> {
  const { data, error } = await supabase.rpc("get_self_practice_questions");

  if (error || !Array.isArray(data)) {
    return { questions: [], questionSets: [] };
  }

  const questionSets: QuestionSet[] = [];
  const allQuestions: Question[] = [];
  const setById = new Map<string, QuestionSet>();

  for (const row of data as SelfPracticeQuestionRow[]) {
    const setId = String(row.set_id);
    const payload = row.payload as Question;
    const question: Question = {
      ...withStandard(payload),
      id: String(row.id),
      questionSetId: setId,
      contentVersion:
        typeof row.content_version === "string"
          ? row.content_version
          : undefined,
      isVisible: true,
      includeInSelfPractice: true,
    };

    let set = setById.get(setId);
    if (!set) {
      set = {
        id: setId,
        name: String(row.set_name),
        source: "generated",
        createdAt: String(row.set_generated_at),
        questionIds: [],
        generationModelId: row.generation_model_id
          ? String(row.generation_model_id)
          : undefined,
        generationModelLabel: row.generation_model_label
          ? String(row.generation_model_label)
          : undefined,
      };
      setById.set(setId, set);
      questionSets.push(set);
    }
    set.questionIds.push(question.id);
    allQuestions.push(question);
  }

  return { questions: allQuestions, questionSets };
}

/**
 * Link a generated set to one or more schools (upsert junction rows).
 *
 * Self Practice **content** is controlled per question (`generated_questions.include_in_self_practice`),
 * not by this junction row. The link only means “this set is associated with this school.”
 *
 * @deprecated The column `school_question_sets.available_for_self_practice` is legacy: RLS and
 *   client queries no longer filter on it. Upserts set it to `true` to satisfy NOT NULL until a
 *   future migration can drop the column.
 */
export async function upsertSchoolQuestionSetLinks(
  supabase: SupabaseClient,
  setId: string,
  entries: { schoolId: string }[],
): Promise<{ error: string | null }> {
  if (entries.length === 0) {
    return { error: null };
  }

  const rows = entries.map((e) => ({
    school_id: e.schoolId,
    set_id: setId,
    available_for_self_practice: true,
  }));

  const { error } = await supabase.from("school_question_sets").upsert(rows, {
    onConflict: "school_id,set_id",
  });

  return { error: error?.message ?? null };
}

/**
 * List sets linked to a school with metadata for Question Manager.
 */
export async function fetchQuestionSetsForSchool(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<{ rows: SchoolQuestionSetRow[]; error: string | null }> {
  const { data: links, error: linkError } = await supabase
    .from("school_question_sets")
    .select("school_id, set_id")
    .eq("school_id", schoolId);

  if (linkError) {
    return { rows: [], error: linkError.message };
  }

  const linkList = links ?? [];
  const setIds = [...new Set(linkList.map((l) => String(l.set_id)))];
  if (setIds.length === 0) {
    return { rows: [], error: null };
  }

  const { data: sets, error: setsError } = await supabase
    .from("generated_question_sets")
    .select("id,name,generated_at,generation_model_id,generation_model_label")
    .in("id", setIds);

  if (setsError) {
    return { rows: [], error: setsError.message };
  }

  const byId = new Map(
    (sets ?? []).map((s) => [String(s.id), s]),
  );

  const rows: SchoolQuestionSetRow[] = [];
  for (const link of linkList) {
    const meta = byId.get(String(link.set_id));
    if (!meta) continue;
    rows.push({
      schoolId: String(link.school_id),
      setId: String(link.set_id),
      setName: String(meta.name),
      generatedAt: String(meta.generated_at),
      generationModelId: meta.generation_model_id
        ? String(meta.generation_model_id)
        : undefined,
      generationModelLabel: meta.generation_model_label
        ? String(meta.generation_model_label)
        : undefined,
    });
  }

  rows.sort(
    (a, b) =>
      new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );

  return { rows, error: null };
}

export async function deleteSchoolQuestionSetLink(
  supabase: SupabaseClient,
  schoolId: string,
  setId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("school_question_sets")
    .delete()
    .eq("school_id", schoolId)
    .eq("set_id", setId);

  return { error: error?.message ?? null };
}
