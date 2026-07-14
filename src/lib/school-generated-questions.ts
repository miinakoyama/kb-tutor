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

/**
 * Questions for students: sets linked to a school they attend, with per-question SP flag.
 */
export async function fetchStudentSelfPracticeQuestions(
  supabase: SupabaseClient,
): Promise<{ questions: Question[]; questionSets: QuestionSet[] }> {
  const { data: links, error: linkError } = await supabase
    .from("school_question_sets")
    .select("set_id");

  if (linkError) {
    return { questions: [], questionSets: [] };
  }

  const setIds = [...new Set((links ?? []).map((row) => String(row.set_id)))];
  if (setIds.length === 0) {
    return { questions: [], questionSets: [] };
  }

  const [{ data: setsData, error: setError }, { data: questionsData, error: qError }] =
    await Promise.all([
      supabase
        .from("generated_question_sets")
        .select("id,name,generated_at,generation_model_id,generation_model_label")
        .in("id", setIds),
      supabase
        .from("generated_questions")
        .select("id,set_id,payload,is_visible,include_in_self_practice,content_version")
        .eq("include_in_self_practice", true)
        .in("set_id", setIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    ]);

  if (setError || qError || !setsData) {
    return { questions: [], questionSets: [] };
  }

  const questionBySet = new Map<string, Question[]>();
  for (const row of questionsData ?? []) {
    const setId = String(row.set_id);
    const payload = row.payload as Question;
    const list = questionBySet.get(setId) ?? [];
    list.push({
      ...withStandard(payload),
      id: String(row.id),
      questionSetId: setId,
      contentVersion:
        typeof row.content_version === "string"
          ? row.content_version
          : undefined,
      isVisible: true,
      includeInSelfPractice: true,
    });
    questionBySet.set(setId, list);
  }

  const questionSets: QuestionSet[] = [];
  const allQuestions: Question[] = [];
  for (const set of setsData) {
    const setId = String(set.id);
    const questions = questionBySet.get(setId) ?? [];
    if (questions.length === 0) continue;
    questionSets.push({
      id: setId,
      name: String(set.name),
      source: "generated",
      createdAt: String(set.generated_at),
      questionIds: questions.map((q) => q.id),
      generationModelId: set.generation_model_id
        ? String(set.generation_model_id)
        : undefined,
      generationModelLabel: set.generation_model_label
        ? String(set.generation_model_label)
        : undefined,
    });
    allQuestions.push(...questions);
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
