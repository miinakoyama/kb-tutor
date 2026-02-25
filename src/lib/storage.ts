import type { AnswerRecord, ConfidenceLevel } from "@/types/question";

const STORAGE_KEYS = {
  ANSWER_HISTORY: "kb-tutor-answer-history",
  REVIEW_LATER: "kb-tutor-review-later",
  SESSION_DATA: "kb-tutor-session-data",
} as const;

export interface StoredAnswer {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  confidenceLevel?: ConfidenceLevel;
  timestamp: number;
  mode: string;
}

export interface TopicAccuracy {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
}

function safeGetItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetItem(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

export function getAnswerHistory(): StoredAnswer[] {
  return safeGetItem<StoredAnswer[]>(STORAGE_KEYS.ANSWER_HISTORY, []);
}

export function saveAnswer(answer: StoredAnswer): void {
  const history = getAnswerHistory();
  history.push(answer);
  safeSetItem(STORAGE_KEYS.ANSWER_HISTORY, history);
}

export function saveAnswerBatch(answers: StoredAnswer[]): void {
  const history = getAnswerHistory();
  history.push(...answers);
  safeSetItem(STORAGE_KEYS.ANSWER_HISTORY, history);
}

export function getReviewLaterIds(): string[] {
  return safeGetItem<string[]>(STORAGE_KEYS.REVIEW_LATER, []);
}

export function addReviewLater(questionId: string): void {
  const ids = getReviewLaterIds();
  if (!ids.includes(questionId)) {
    ids.push(questionId);
    safeSetItem(STORAGE_KEYS.REVIEW_LATER, ids);
  }
}

export function removeReviewLater(questionId: string): void {
  const ids = getReviewLaterIds().filter((id) => id !== questionId);
  safeSetItem(STORAGE_KEYS.REVIEW_LATER, ids);
}

export function getTopicAccuracy(topic: string): TopicAccuracy {
  const history = getAnswerHistory().filter(
    (a) => a.questionId.startsWith(topic.toLowerCase().replace(/\s+/g, "-"))
  );
  const correct = history.filter((a) => a.isCorrect).length;
  const total = history.length;
  return {
    topic,
    correct,
    total,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
  };
}

export function getIncorrectQuestionIds(): string[] {
  const history = getAnswerHistory();
  const lastAnswerByQuestion = new Map<string, StoredAnswer>();
  for (const answer of history) {
    lastAnswerByQuestion.set(answer.questionId, answer);
  }
  return Array.from(lastAnswerByQuestion.entries())
    .filter(([, answer]) => !answer.isCorrect)
    .map(([id]) => id);
}

export function getLowConfidenceQuestionIds(): string[] {
  const history = getAnswerHistory();
  const lastAnswerByQuestion = new Map<string, StoredAnswer>();
  for (const answer of history) {
    lastAnswerByQuestion.set(answer.questionId, answer);
  }
  return Array.from(lastAnswerByQuestion.entries())
    .filter(
      ([, answer]) =>
        answer.confidenceLevel === "not_sure" ||
        answer.confidenceLevel === "somewhat"
    )
    .map(([id]) => id);
}

export interface ReviewQuestionIds {
  incorrect: string[];
  reviewLater: string[];
  lowConfidence: string[];
}

export function getReviewQuestionIds(): ReviewQuestionIds {
  return {
    incorrect: getIncorrectQuestionIds(),
    reviewLater: getReviewLaterIds(),
    lowConfidence: getLowConfidenceQuestionIds(),
  };
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.ANSWER_HISTORY);
  localStorage.removeItem(STORAGE_KEYS.REVIEW_LATER);
  localStorage.removeItem(STORAGE_KEYS.SESSION_DATA);
}
