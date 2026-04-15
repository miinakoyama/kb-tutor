import type { ConfidenceLevel } from "@/types/question";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const STORAGE_KEYS = {
  ANSWER_HISTORY: "kb-tutor-answer-history",
  BOOKMARKS: "kb-tutor-bookmarks",
  SESSION_DATA: "kb-tutor-session-data",
  MIGRATION_DONE: "kb-tutor-migration-v1",
} as const;

export interface StoredAnswer {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  confidenceLevel?: ConfidenceLevel;
  module?: number;
  topic?: string;
  standardId?: string;
  standardLabel?: string;
  timeSpentSec?: number;
  assignmentId?: string;
  studentId?: string;
  teacherId?: string;
  classId?: string;
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

function canUseRemoteDb(): boolean {
  return typeof window !== "undefined" && hasSupabaseEnv();
}

export function getAnswerHistory(): StoredAnswer[] {
  return safeGetItem<StoredAnswer[]>(STORAGE_KEYS.ANSWER_HISTORY, []);
}

export function saveAnswer(answer: StoredAnswer): void {
  const history = getAnswerHistory();
  history.push(answer);
  safeSetItem(STORAGE_KEYS.ANSWER_HISTORY, history);
  void upsertAttempt(answer);
}

export function saveAnswerBatch(answers: StoredAnswer[]): void {
  const history = getAnswerHistory();
  history.push(...answers);
  safeSetItem(STORAGE_KEYS.ANSWER_HISTORY, history);
  void Promise.all(answers.map((answer) => upsertAttempt(answer)));
}

export function getBookmarkedIds(): string[] {
  return safeGetItem<string[]>(STORAGE_KEYS.BOOKMARKS, []);
}

export function isBookmarked(questionId: string): boolean {
  return getBookmarkedIds().includes(questionId);
}

export function addBookmark(questionId: string): void {
  const ids = getBookmarkedIds();
  if (!ids.includes(questionId)) {
    ids.push(questionId);
    safeSetItem(STORAGE_KEYS.BOOKMARKS, ids);
    void setBookmarkInDb(questionId, true);
  }
}

export function removeBookmark(questionId: string): void {
  const ids = getBookmarkedIds().filter((id) => id !== questionId);
  safeSetItem(STORAGE_KEYS.BOOKMARKS, ids);
  void setBookmarkInDb(questionId, false);
}

export function toggleBookmark(questionId: string): boolean {
  if (isBookmarked(questionId)) {
    removeBookmark(questionId);
    return false;
  } else {
    addBookmark(questionId);
    return true;
  }
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

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.ANSWER_HISTORY);
  localStorage.removeItem(STORAGE_KEYS.BOOKMARKS);
  localStorage.removeItem(STORAGE_KEYS.SESSION_DATA);
}

function toDbAttempt(answer: StoredAnswer) {
  return {
    question_id: answer.questionId,
    selected_option_id: answer.selectedOptionId,
    is_correct: answer.isCorrect,
    mode: answer.mode,
    module: answer.module ?? null,
    topic: answer.topic ?? null,
    standard_id: answer.standardId ?? null,
    standard_label: answer.standardLabel ?? null,
    time_spent_sec: answer.timeSpentSec ?? null,
    assignment_id: answer.assignmentId ?? null,
    answered_at: new Date(answer.timestamp).toISOString(),
  };
}

export async function upsertAttempt(answer: StoredAnswer): Promise<void> {
  if (!canUseRemoteDb()) return;
  try {
    const supabase = getSupabaseBrowserClient();
    await supabase.from("attempts").insert(toDbAttempt(answer));
  } catch {
    // keep local fallback
  }
}

async function setBookmarkInDb(questionId: string, enabled: boolean) {
  if (!canUseRemoteDb()) return;
  try {
    const supabase = getSupabaseBrowserClient();
    if (enabled) {
      await supabase.from("bookmarks").upsert({ question_id: questionId });
      return;
    }
    await supabase.from("bookmarks").delete().eq("question_id", questionId);
  } catch {
    // keep local fallback
  }
}

export async function syncBookmarksFromDb(): Promise<string[]> {
  if (!canUseRemoteDb()) return getBookmarkedIds();
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("bookmarks")
      .select("question_id")
      .order("created_at", { ascending: false });
    if (error || !data) return getBookmarkedIds();
    const ids = data.map((row) => row.question_id as string);
    safeSetItem(STORAGE_KEYS.BOOKMARKS, ids);
    return ids;
  } catch {
    return getBookmarkedIds();
  }
}

export async function syncAnswerHistoryFromDb(): Promise<StoredAnswer[]> {
  if (!canUseRemoteDb()) return getAnswerHistory();
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("attempts")
      .select(
        "question_id,selected_option_id,is_correct,mode,module,topic,standard_id,standard_label,time_spent_sec,assignment_id,answered_at",
      )
      .order("answered_at", { ascending: true });
    if (error || !data) return getAnswerHistory();

    const answers: StoredAnswer[] = data.map((row) => ({
      questionId: String(row.question_id),
      selectedOptionId: String(row.selected_option_id),
      isCorrect: Boolean(row.is_correct),
      mode: String(row.mode),
      module: row.module ? Number(row.module) : undefined,
      topic: row.topic ? String(row.topic) : undefined,
      standardId: row.standard_id ? String(row.standard_id) : undefined,
      standardLabel: row.standard_label ? String(row.standard_label) : undefined,
      timeSpentSec: row.time_spent_sec ? Number(row.time_spent_sec) : undefined,
      assignmentId: row.assignment_id ? String(row.assignment_id) : undefined,
      timestamp: new Date(String(row.answered_at)).getTime(),
    }));
    safeSetItem(STORAGE_KEYS.ANSWER_HISTORY, answers);
    return answers;
  } catch {
    return getAnswerHistory();
  }
}

export async function migrateStorageToDatabaseOnce(): Promise<void> {
  if (!canUseRemoteDb()) return;
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(STORAGE_KEYS.MIGRATION_DONE) === "1") return;

  const localAnswers = getAnswerHistory();
  const localBookmarks = getBookmarkedIds();

  try {
    const supabase = getSupabaseBrowserClient();
    if (localAnswers.length > 0) {
      await supabase.from("attempts").insert(localAnswers.map(toDbAttempt));
    }
    if (localBookmarks.length > 0) {
      await supabase
        .from("bookmarks")
        .upsert(localBookmarks.map((questionId) => ({ question_id: questionId })));
    }

    window.localStorage.setItem(STORAGE_KEYS.MIGRATION_DONE, "1");
    window.localStorage.removeItem(STORAGE_KEYS.ANSWER_HISTORY);
    window.localStorage.removeItem(STORAGE_KEYS.BOOKMARKS);
  } catch {
    // retry next launch
  }
}
