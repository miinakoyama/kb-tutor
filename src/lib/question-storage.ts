import type { Question, QuestionSet } from "@/types/question";
import { getDefaultStandardForTopic } from "@/lib/standards";

const GENERATED_SETS_KEY = "generatedQuestionSets";

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

export function addGeneratedQuestionSet(
  questions: Question[],
  name: string,
  generatedAt: string,
  generationModel?: { id?: string; label?: string }
): string {
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
  
  return setId;
}

export function getAllGeneratedQuestionSets(): {
  questions: Question[];
  questionSets: QuestionSet[];
} {
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

export function getGeneratedQuestionSetById(setId: string): {
  questions: Question[];
  questionSet: QuestionSet | null;
} {
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

export function deleteGeneratedQuestionSet(setId: string): void {
  const data = getStoredData();
  data.sets = data.sets.filter((s) => s.id !== setId);
  saveStoredData(data);
}

export function updateGeneratedQuestionInStorage(
  setId: string,
  updated: Question
): void {
  const data = getStoredData();
  const setIndex = data.sets.findIndex((s) => s.id === setId);
  if (setIndex === -1) return;

  data.sets[setIndex].questions = data.sets[setIndex].questions.map((q) =>
    q.id === updated.id ? { ...updated, questionSetId: undefined } : q
  );

  saveStoredData(data);
}

export function deleteGeneratedQuestionFromStorage(
  setId: string,
  questionId: string
): void {
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
}

export function toggleQuestionVisibility(
  setId: string,
  questionId: string
): void {
  const data = getStoredData();
  const setIndex = data.sets.findIndex((s) => s.id === setId);
  if (setIndex === -1) return;

  data.sets[setIndex].questions = data.sets[setIndex].questions.map((q) => {
    if (q.id === questionId) {
      return { ...q, isVisible: q.isVisible === false ? true : false };
    }
    return q;
  });

  saveStoredData(data);
}

// Legacy compatibility - for single set operations
export function getGeneratedQuestionsFromStorage(): {
  questions: Question[];
  questionSet: QuestionSet | null;
} {
  const { questions, questionSets } = getAllGeneratedQuestionSets();
  if (questionSets.length === 0) {
    return { questions: [], questionSet: null };
  }
  // Return the most recent set for backward compatibility
  return { questions, questionSet: questionSets[0] };
}
