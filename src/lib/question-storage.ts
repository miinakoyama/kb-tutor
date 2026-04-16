import type { Question, QuestionSet } from "@/types/question";
import { assertSetNameUniqueForSchools } from "@/lib/generated-set-naming";
import { getDefaultStandardForTopic } from "@/lib/standards";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { upsertSchoolQuestionSetLinks } from "@/lib/school-generated-questions";

const GENERATED_SETS_KEY = "generatedQuestionSets";
const GENERATED_SETS_MIGRATION_KEY = "generatedQuestionSetsMigratedV1";

interface StoredQuestionSet {
  id: string;
  name: string;
  questions: Question[];
  generatedAt: string;
  generationModelId?: string;
  generationModelLabel?: string;
}

interface StoredData {
  sets: StoredQuestionSet[];
}

function withStandard(question: Question): Question {
  if (question.standardId) return question;
  const standard = getDefaultStandardForTopic(question.topic);
  return {
    ...question,
    standardId: standard.id,
    standardLabel: standard.label,
  };
}

/** Payload JSON must not duplicate table-backed fields (`include_in_self_practice`, etc.). */
function persistedPayloadForQuestion(
  q: Question,
): Omit<Question, "questionSetId" | "includeInSelfPractice"> {
  const { questionSetId, includeInSelfPractice, ...rest } = q;
  void questionSetId;
  void includeInSelfPractice;
  return rest;
}

function getStoredData(): StoredData {
  if (typeof window === "undefined") return { sets: [] };

  try {
    const stored = localStorage.getItem(GENERATED_SETS_KEY);
    if (!stored) {
      const oldData = localStorage.getItem("generatedQuestions");
      if (oldData) {
        const parsed = JSON.parse(oldData) as {
          questions?: Question[];
          generatedAt?: string;
          settings?: { questionSetName?: string };
        };
        if (parsed.questions && parsed.questions.length > 0) {
          const migratedSet: StoredQuestionSet = {
            id: `generated-${parsed.generatedAt}`,
            name:
              parsed.settings?.questionSetName ??
              `Generated ${new Date(String(parsed.generatedAt)).toLocaleDateString()}`,
            questions: parsed.questions,
            generatedAt: String(parsed.generatedAt),
          };
          const newData: StoredData = { sets: [migratedSet] };
          localStorage.setItem(GENERATED_SETS_KEY, JSON.stringify(newData));
          localStorage.removeItem("generatedQuestions");
          return newData;
        }
      }
      return { sets: [] };
    }
    return JSON.parse(stored) as StoredData;
  } catch {
    return { sets: [] };
  }
}

function canUseRemoteDb(): boolean {
  return typeof window !== "undefined" && hasSupabaseEnv();
}

export type AddGeneratedSetOptions = {
  generationModel?: { id?: string; label?: string };
  /** When provided, creates junction rows after saving the set. */
  schoolLinks?: { schoolId: string }[];
};

export async function addGeneratedQuestionSet(
  questions: Question[],
  name: string,
  generatedAt: string,
  opts?: AddGeneratedSetOptions,
): Promise<string> {
  const model = opts?.generationModel;
  const schoolLinks = opts?.schoolLinks;

  if (!canUseRemoteDb()) {
    throw new Error("Supabase is not configured; cannot save question sets.");
  }

  const supabase = getSupabaseBrowserClient();
  const setId = `generated-${generatedAt}`;

  const newSetName = name || `Generated ${new Date(generatedAt).toLocaleDateString()}`;

  if (schoolLinks && schoolLinks.length > 0) {
    const unique = await assertSetNameUniqueForSchools(
      supabase,
      newSetName,
      schoolLinks.map((l) => l.schoolId),
    );
    if (!unique.ok) {
      throw new Error(unique.message);
    }
  }

  const { error: setErr } = await supabase.from("generated_question_sets").upsert({
    id: setId,
    name: newSetName,
    generated_at: generatedAt,
    generation_model_id: model?.id ?? null,
    generation_model_label: model?.label ?? null,
  });

  if (setErr) {
    throw new Error(setErr.message);
  }

  const { error: qErr } = await supabase.from("generated_questions").upsert(
    questions.map((raw) => {
      const q = withStandard(raw);
      return {
        id: q.id,
        set_id: setId,
        payload: persistedPayloadForQuestion(q),
        is_visible: true,
        include_in_self_practice: q.includeInSelfPractice === true,
      };
    }),
  );

  if (qErr) {
    throw new Error(qErr.message);
  }

  if (schoolLinks && schoolLinks.length > 0) {
    const { error: linkErr } = await upsertSchoolQuestionSetLinks(
      supabase,
      setId,
      schoolLinks,
    );
    if (linkErr) {
      throw new Error(linkErr);
    }
  }

  return setId;
}

export async function getAllGeneratedQuestionSets(): Promise<{
  questions: Question[];
  questionSets: QuestionSet[];
}> {
  if (!canUseRemoteDb()) {
    return { questions: [], questionSets: [] };
  }

  await migrateGeneratedSetsToDbOnce();

  try {
    const supabase = getSupabaseBrowserClient();
    const [{ data: setsData, error: setError }, { data: questionsData, error: questionError }] =
      await Promise.all([
        supabase
          .from("generated_question_sets")
          .select("id,name,generated_at,generation_model_id,generation_model_label")
          .order("generated_at", { ascending: false }),
        supabase
          .from("generated_questions")
          .select("id,set_id,payload,is_visible,include_in_self_practice")
          .order("set_id", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
      ]);

    if (setError || questionError || !setsData) {
      return { questions: [], questionSets: [] };
    }

    const questionBySet = new Map<string, Question[]>();
    for (const row of questionsData ?? []) {
      const setId = String(row.set_id);
      const payload = row.payload as Question;
      const list = questionBySet.get(setId) ?? [];
      list.push({
        ...withStandard(payload),
        questionSetId: setId,
        isVisible: true,
        includeInSelfPractice: row.include_in_self_practice === true,
      });
      questionBySet.set(setId, list);
    }

    const questionSets: QuestionSet[] = [];
    const allQuestions: Question[] = [];
    for (const set of setsData) {
      const setId = String(set.id);
      const qs = questionBySet.get(setId) ?? [];
      questionSets.push({
        id: setId,
        name: String(set.name),
        source: "generated",
        createdAt: String(set.generated_at),
        questionIds: qs.map((q) => q.id),
        generationModelId: set.generation_model_id
          ? String(set.generation_model_id)
          : undefined,
        generationModelLabel: set.generation_model_label
          ? String(set.generation_model_label)
          : undefined,
      });
      allQuestions.push(...qs);
    }
    return { questions: allQuestions, questionSets };
  } catch {
    return { questions: [], questionSets: [] };
  }
}

export async function getGeneratedQuestionSetById(setId: string): Promise<{
  questions: Question[];
  questionSet: QuestionSet | null;
}> {
  if (!canUseRemoteDb()) {
    return { questions: [], questionSet: null };
  }

  try {
    const supabase = getSupabaseBrowserClient();
    const [{ data: setData, error: setError }, { data: questionRows, error: questionError }] =
      await Promise.all([
        supabase
          .from("generated_question_sets")
          .select("id,name,generated_at,generation_model_id,generation_model_label")
          .eq("id", setId)
          .maybeSingle(),
        supabase
          .from("generated_questions")
          .select("id,payload,is_visible,include_in_self_practice")
          .eq("set_id", setId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
      ]);

    if (setError || questionError || !setData) {
      return { questions: [], questionSet: null };
    }

    const questions = (questionRows ?? []).map((row) => ({
      ...withStandard(row.payload as Question),
      questionSetId: setId,
      isVisible: true,
      includeInSelfPractice: row.include_in_self_practice === true,
    }));
    const questionSet: QuestionSet = {
      id: String(setData.id),
      name: String(setData.name),
      source: "generated",
      createdAt: String(setData.generated_at),
      questionIds: questions.map((q) => q.id),
      generationModelId: setData.generation_model_id
        ? String(setData.generation_model_id)
        : undefined,
      generationModelLabel: setData.generation_model_label
        ? String(setData.generation_model_label)
        : undefined,
    };
    return { questions, questionSet };
  } catch {
    return { questions: [], questionSet: null };
  }
}

export async function deleteGeneratedQuestionSet(setId: string): Promise<void> {
  if (!canUseRemoteDb()) {
    throw new Error("Supabase is not configured; cannot delete question sets.");
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("generated_question_sets")
    .delete()
    .eq("id", setId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function updateGeneratedQuestionInStorage(
  setId: string,
  updated: Question,
): Promise<void> {
  if (!canUseRemoteDb()) {
    throw new Error("Supabase is not configured; cannot save questions.");
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("generated_questions").upsert({
    id: updated.id,
    set_id: setId,
    payload: persistedPayloadForQuestion(updated),
    is_visible: true,
    include_in_self_practice: updated.includeInSelfPractice === true,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteGeneratedQuestionFromStorage(
  setId: string,
  questionId: string,
): Promise<void> {
  if (!canUseRemoteDb()) {
    throw new Error("Supabase is not configured; cannot delete questions.");
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("generated_questions")
    .delete()
    .eq("set_id", setId)
    .eq("id", questionId);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Atomically flips `include_in_self_practice` via RPC. Returns the new value.
 * @throws If Supabase rejects the call (RLS, network, or no row updated).
 */
export async function toggleIncludeInSelfPractice(
  setId: string,
  questionId: string,
): Promise<boolean> {
  if (!canUseRemoteDb()) {
    throw new Error("Supabase is not configured.");
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(
    "toggle_generated_question_include_sp",
    {
      p_set_id: setId,
      p_question_id: questionId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }
  if (data === null || data === undefined) {
    throw new Error(
      "Could not update Self Practice flag. The question may not exist or you may not have access.",
    );
  }
  return Boolean(data);
}

export async function getGeneratedQuestionsFromStorage(): Promise<{
  questions: Question[];
  questionSet: QuestionSet | null;
}> {
  const { questions, questionSets } = await getAllGeneratedQuestionSets();
  if (questionSets.length === 0) {
    return { questions: [], questionSet: null };
  }
  return { questions, questionSet: questionSets[0] };
}

/** One-time migration from legacy localStorage keys to Supabase. */
export async function migrateGeneratedSetsToDbOnce(): Promise<void> {
  if (!canUseRemoteDb() || typeof window === "undefined") return;
  if (window.localStorage.getItem(GENERATED_SETS_MIGRATION_KEY) === "1") return;

  const local = getStoredData();
  if (local.sets.length === 0) {
    window.localStorage.setItem(GENERATED_SETS_MIGRATION_KEY, "1");
    return;
  }

  try {
    const supabase = getSupabaseBrowserClient();
    for (const set of local.sets) {
      await supabase.from("generated_question_sets").upsert({
        id: set.id,
        name: set.name,
        generated_at: set.generatedAt,
        generation_model_id: set.generationModelId ?? null,
        generation_model_label: set.generationModelLabel ?? null,
      });
      await supabase.from("generated_questions").upsert(
        set.questions.map((raw) => {
          const q = withStandard(raw);
          return {
            id: q.id,
            set_id: set.id,
            payload: persistedPayloadForQuestion(q),
            is_visible: true,
            include_in_self_practice: q.includeInSelfPractice === true,
          };
        }),
      );
    }
    window.localStorage.setItem(GENERATED_SETS_MIGRATION_KEY, "1");
    window.localStorage.removeItem(GENERATED_SETS_KEY);
    window.localStorage.removeItem("generatedQuestions");
  } catch {
    // retry next launch
  }
}
