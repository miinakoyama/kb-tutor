import type { Question, QuestionSet } from "@/types/question";
import { getDefaultStandardForTopic } from "@/lib/standards";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

function getStoredData(): StoredData {
  if (typeof window === "undefined") return { sets: [] };

  try {
    const stored = localStorage.getItem(GENERATED_SETS_KEY);
    if (!stored) {
      // Migrate from old format if exists
      const oldData = localStorage.getItem("generatedQuestions");
      if (oldData) {
        const parsed = JSON.parse(oldData);
        if (parsed.questions && parsed.questions.length > 0) {
          const migratedSet: StoredQuestionSet = {
            id: `generated-${parsed.generatedAt}`,
            name: parsed.settings?.questionSetName || 
              `Generated ${new Date(parsed.generatedAt).toLocaleDateString()}`,
            questions: parsed.questions,
            generatedAt: parsed.generatedAt,
          };
          const newData: StoredData = { sets: [migratedSet] };
          localStorage.setItem(GENERATED_SETS_KEY, JSON.stringify(newData));
          localStorage.removeItem("generatedQuestions");
          return newData;
        }
      }
      return { sets: [] };
    }
    return JSON.parse(stored);
  } catch {
    return { sets: [] };
  }
}

function saveStoredData(data: StoredData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GENERATED_SETS_KEY, JSON.stringify(data));
}

function canUseRemoteDb(): boolean {
  return typeof window !== "undefined" && hasSupabaseEnv();
}

export async function addGeneratedQuestionSet(
  questions: Question[],
  name: string,
  generatedAt: string,
  generationModel?: { id?: string; label?: string }
): Promise<string> {
  const data = getStoredData();
  const setId = `generated-${generatedAt}`;
  
  const newSet: StoredQuestionSet = {
    id: setId,
    name: name || `Generated ${new Date(generatedAt).toLocaleDateString()}`,
    questions: questions.map(withStandard),
    generatedAt,
    generationModelId: generationModel?.id,
    generationModelLabel: generationModel?.label,
  };
  
  data.sets.unshift(newSet);
  saveStoredData(data);

  if (canUseRemoteDb()) {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("generated_question_sets").upsert({
        id: setId,
        name: newSet.name,
        generated_at: newSet.generatedAt,
        generation_model_id: newSet.generationModelId ?? null,
        generation_model_label: newSet.generationModelLabel ?? null,
      });
      await supabase
        .from("generated_questions")
        .upsert(
          newSet.questions.map((q) => ({
            id: q.id,
            set_id: setId,
            payload: q,
            is_visible: q.isVisible !== false,
          })),
        );
    } catch {
      // keep local fallback
    }
  }

  return setId;
}

export async function getAllGeneratedQuestionSets(): Promise<{
  questions: Question[];
  questionSets: QuestionSet[];
}> {
  if (canUseRemoteDb()) {
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
            .select("id,set_id,payload,is_visible"),
        ]);

      if (!setError && !questionError && setsData) {
        const questionBySet = new Map<string, Question[]>();
        for (const row of questionsData ?? []) {
          const setId = String(row.set_id);
          const payload = row.payload as Question;
          const list = questionBySet.get(setId) ?? [];
          list.push({
            ...withStandard(payload),
            questionSetId: setId,
            isVisible: row.is_visible === false ? false : payload.isVisible,
          });
          questionBySet.set(setId, list);
        }

        const questionSets: QuestionSet[] = [];
        const allQuestions: Question[] = [];
        for (const set of setsData) {
          const setId = String(set.id);
          const questions = questionBySet.get(setId) ?? [];
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
    } catch {
      // fallback to local
    }
  }

  const data = getStoredData();
  
  if (data.sets.length === 0) {
    return { questions: [], questionSets: [] };
  }

  const allQuestions: Question[] = [];
  const questionSets: QuestionSet[] = [];

  for (const set of data.sets) {
    const questionSet: QuestionSet = {
      id: set.id,
      name: set.name,
      source: "generated",
      createdAt: set.generatedAt,
      questionIds: set.questions.map((q) => q.id),
      generationModelId: set.generationModelId,
      generationModelLabel: set.generationModelLabel,
    };
    questionSets.push(questionSet);

    const questionsWithSetId = set.questions.map((q) => ({
      ...withStandard(q),
      questionSetId: set.id,
    }));
    allQuestions.push(...questionsWithSetId);
  }

  return { questions: allQuestions, questionSets };
}

export async function getGeneratedQuestionSetById(setId: string): Promise<{
  questions: Question[];
  questionSet: QuestionSet | null;
}> {
  if (canUseRemoteDb()) {
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
            .select("id,payload,is_visible")
            .eq("set_id", setId),
        ]);

      if (!setError && !questionError && setData) {
        const questions = (questionRows ?? []).map((row) => ({
          ...(row.payload as Question),
          questionSetId: setId,
          isVisible: row.is_visible === false ? false : (row.payload as Question).isVisible,
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
      }
    } catch {
      // fallback to local
    }
  }

  const data = getStoredData();
  const set = data.sets.find((s) => s.id === setId);
  
  if (!set) {
    return { questions: [], questionSet: null };
  }

  const questionSet: QuestionSet = {
    id: set.id,
    name: set.name,
    source: "generated",
    createdAt: set.generatedAt,
    questionIds: set.questions.map((q) => q.id),
    generationModelId: set.generationModelId,
    generationModelLabel: set.generationModelLabel,
  };

  const questionsWithSetId = set.questions.map((q) => ({
    ...withStandard(q),
    questionSetId: set.id,
  }));

  return { questions: questionsWithSetId, questionSet };
}

export function clearAllGeneratedQuestions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GENERATED_SETS_KEY);
  localStorage.removeItem("generatedQuestions"); // Clean up old format
}

export async function deleteGeneratedQuestionSet(setId: string): Promise<void> {
  const data = getStoredData();
  data.sets = data.sets.filter((s) => s.id !== setId);
  saveStoredData(data);

  if (canUseRemoteDb()) {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("generated_question_sets").delete().eq("id", setId);
    } catch {
      // keep local fallback
    }
  }
}

export async function updateGeneratedQuestionInStorage(
  setId: string,
  updated: Question
): Promise<void> {
  const data = getStoredData();
  const setIndex = data.sets.findIndex((s) => s.id === setId);
  if (setIndex === -1) return;

  data.sets[setIndex].questions = data.sets[setIndex].questions.map((q) =>
    q.id === updated.id ? { ...updated, questionSetId: undefined } : q
  );

  saveStoredData(data);

  if (canUseRemoteDb()) {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("generated_questions").upsert({
        id: updated.id,
        set_id: setId,
        payload: { ...updated, questionSetId: undefined },
        is_visible: updated.isVisible !== false,
      });
    } catch {
      // keep local fallback
    }
  }
}

export async function deleteGeneratedQuestionFromStorage(
  setId: string,
  questionId: string
): Promise<void> {
  const data = getStoredData();
  const setIndex = data.sets.findIndex((s) => s.id === setId);
  if (setIndex === -1) return;

  data.sets[setIndex].questions = data.sets[setIndex].questions.filter(
    (q) => q.id !== questionId
  );

  if (data.sets[setIndex].questions.length === 0) {
    data.sets.splice(setIndex, 1);
  }

  saveStoredData(data);

  if (canUseRemoteDb()) {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase
        .from("generated_questions")
        .delete()
        .eq("set_id", setId)
        .eq("id", questionId);
    } catch {
      // keep local fallback
    }
  }
}

export async function toggleQuestionVisibility(
  setId: string,
  questionId: string
): Promise<void> {
  const data = getStoredData();
  const setIndex = data.sets.findIndex((s) => s.id === setId);
  if (setIndex === -1) return;

  let nextVisible = true;
  data.sets[setIndex].questions = data.sets[setIndex].questions.map((q) => {
    if (q.id === questionId) {
      nextVisible = q.isVisible === false ? true : false;
      return { ...q, isVisible: nextVisible };
    }
    return q;
  });

  saveStoredData(data);

  if (canUseRemoteDb()) {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase
        .from("generated_questions")
        .update({ is_visible: nextVisible })
        .eq("set_id", setId)
        .eq("id", questionId);
    } catch {
      // keep local fallback
    }
  }
}

// Legacy compatibility - for single set operations
export async function getGeneratedQuestionsFromStorage(): Promise<{
  questions: Question[];
  questionSet: QuestionSet | null;
}> {
  const { questions, questionSets } = await getAllGeneratedQuestionSets();
  if (questionSets.length === 0) {
    return { questions: [], questionSet: null };
  }
  // Return the most recent set for backward compatibility
  return { questions, questionSet: questionSets[0] };
}

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
      await supabase
        .from("generated_questions")
        .upsert(
          set.questions.map((q) => ({
            id: q.id,
            set_id: set.id,
            payload: q,
            is_visible: q.isVisible !== false,
          })),
        );
    }
    window.localStorage.setItem(GENERATED_SETS_MIGRATION_KEY, "1");
    window.localStorage.removeItem(GENERATED_SETS_KEY);
    window.localStorage.removeItem("generatedQuestions");
  } catch {
    // retry next launch
  }
}
