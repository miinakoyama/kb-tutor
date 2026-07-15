import type { ConfidenceLevel } from "@/types/question";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { incrementWrongCount } from "@/lib/review-priority";
import { questionHistoryKey } from "@/lib/bkt/question-history";
import {
  enqueueAttempt,
  enqueueAttempts,
  enqueueBookmark,
  type AttemptPayload,
} from "@/lib/sync-queue";

const STORAGE_KEYS = {
  ANSWER_HISTORY: "kb-tutor-answer-history",
  BOOKMARKS: "kb-tutor-bookmarks",
  SESSION_DATA: "kb-tutor-session-data",
  MIGRATION_DONE: "kb-tutor-migration-v1",
} as const;

export interface StoredAnswer {
  questionId: string;
  questionSetId?: string;
  questionContentVersion?: string;
  isFinalized?: boolean;
  /** Whether this response completes one presentation of the whole question. */
  questionCompleted?: boolean;
  selectedOptionId: string;
  isCorrect: boolean;
  confidenceLevel?: ConfidenceLevel;
  module?: number;
  topic?: string;
  standardId?: string;
  standardLabel?: string;
  timeSpentSec?: number;
  assignmentId?: string;
  timestamp: number;
  mode: string;
  /**
   * Client-generated idempotency key. Persisted so that retries after a silent
   * network failure don't create duplicate rows. Auto-filled when missing.
   */
  clientAttemptId?: string;
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

/**
 * Synchronous read of the localStorage cache. Suitable for hot paths that
 * can't await (e.g. a 1Hz polling indicator). If you need a guaranteed
 * fresh read that reflects changes from other devices, use
 * `fetchAnswerHistory()` instead.
 */
export function getAnswerHistory(): StoredAnswer[] {
  return safeGetItem<StoredAnswer[]>(STORAGE_KEYS.ANSWER_HISTORY, []);
}

/**
 * DB-primary read of the current user's answer history. Falls back to the
 * localStorage cache when Supabase is unreachable (offline, throttled, etc).
 * This is the preferred read for rendering paths that can await.
 */
export async function fetchAnswerHistory(): Promise<StoredAnswer[]> {
  if (!canUseRemoteDb()) return getAnswerHistory();
  return syncAnswerHistoryFromDb();
}

function generateAttemptId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function withAttemptId(answer: StoredAnswer): StoredAnswer {
  if (answer.clientAttemptId) return answer;
  return { ...answer, clientAttemptId: generateAttemptId() };
}

function toAttemptPayload(answer: StoredAnswer): AttemptPayload {
  return {
    clientAttemptId: answer.clientAttemptId ?? generateAttemptId(),
    questionId: answer.questionId,
    questionSetId: answer.questionSetId ?? null,
    questionContentVersion: answer.questionContentVersion ?? null,
    isFinalized: answer.isFinalized ?? true,
    questionCompleted: answer.questionCompleted ?? true,
    selectedOptionId: answer.selectedOptionId,
    isCorrect: answer.isCorrect,
    mode: answer.mode,
    module: answer.module ?? null,
    topic: answer.topic ?? null,
    standardId: answer.standardId ?? null,
    standardLabel: answer.standardLabel ?? null,
    timeSpentSec: answer.timeSpentSec ?? null,
    assignmentId: answer.assignmentId ?? null,
    answeredAt: new Date(answer.timestamp).toISOString(),
  };
}

export function saveAnswer(answer: StoredAnswer): void {
  const enriched = withAttemptId(answer);
  const history = getAnswerHistory();
  history.push(enriched);
  safeSetItem(STORAGE_KEYS.ANSWER_HISTORY, history);
  if (canUseRemoteDb()) {
    enqueueAttempt(toAttemptPayload(enriched));
  }
}

export function saveAnswerBatch(answers: StoredAnswer[]): void {
  const enriched = answers.map(withAttemptId);
  const history = getAnswerHistory();
  history.push(...enriched);
  safeSetItem(STORAGE_KEYS.ANSWER_HISTORY, history);
  if (canUseRemoteDb()) {
    enqueueAttempts(enriched.map(toAttemptPayload));
  }
}

/**
 * Synchronous read of the localStorage bookmark cache. Prefer
 * `fetchBookmarkIds()` for rendering paths that can await.
 */
export function getBookmarkedIds(): string[] {
  return safeGetItem<string[]>(STORAGE_KEYS.BOOKMARKS, []);
}

/**
 * Synchronous cache read. Prefer `fetchIsBookmarked(id)` when possible.
 */
export function isBookmarked(questionId: string): boolean {
  return getBookmarkedIds().includes(questionId);
}

/** DB-primary read. Falls back to localStorage cache when Supabase is unreachable. */
export async function fetchBookmarkIds(): Promise<string[]> {
  if (!canUseRemoteDb()) return getBookmarkedIds();
  return syncBookmarksFromDb();
}

/** DB-primary read. Falls back to localStorage cache when Supabase is unreachable. */
export async function fetchIsBookmarked(questionId: string): Promise<boolean> {
  const ids = await fetchBookmarkIds();
  return ids.includes(questionId);
}

export function addBookmark(questionId: string): void {
  const ids = getBookmarkedIds();
  if (!ids.includes(questionId)) {
    ids.push(questionId);
    safeSetItem(STORAGE_KEYS.BOOKMARKS, ids);
    if (canUseRemoteDb()) enqueueBookmark({ questionId, enabled: true });
  }
}

export function removeBookmark(questionId: string): void {
  const ids = getBookmarkedIds().filter((id) => id !== questionId);
  safeSetItem(STORAGE_KEYS.BOOKMARKS, ids);
  if (canUseRemoteDb()) enqueueBookmark({ questionId, enabled: false });
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
    (a) =>
      a.isFinalized !== false &&
      a.questionId.startsWith(topic.toLowerCase().replace(/\s+/g, "-"))
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

function computeIncorrectIds(history: StoredAnswer[]): string[] {
  return [
    ...new Set(
      history
        .filter(
          (answer) => answer.isFinalized !== false && !answer.isCorrect,
        )
        .map((answer) => answer.questionId),
    ),
  ];
}

function computeFirstTryIncorrectIds(history: StoredAnswer[]): string[] {
  const firstOutcomeByQuestion = new Map<string, boolean>();
  const sortedByTime = history
    .filter((answer) => answer.isFinalized !== false)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const answer of sortedByTime) {
    if (!firstOutcomeByQuestion.has(answer.questionId)) {
      firstOutcomeByQuestion.set(answer.questionId, answer.isCorrect);
    }
  }

  return Array.from(firstOutcomeByQuestion.entries())
    .filter(([, isCorrect]) => !isCorrect)
    .map(([questionId]) => questionId);
}

function computeIncorrectCounts(history: StoredAnswer[]): Map<string, number> {
  const wrongCountByQuestion = new Map<string, number>();
  for (const answer of history) {
    if (answer.isFinalized === false) continue;
    incrementWrongCount(
      wrongCountByQuestion,
      questionHistoryKey(answer.questionSetId ?? null, answer.questionId),
      answer.isCorrect,
    );
  }
  return wrongCountByQuestion;
}

/**
 * Synchronous cache read. Prefer `fetchIncorrectQuestionIds()` when possible.
 */
export function getIncorrectQuestionIds(): string[] {
  return computeIncorrectIds(getAnswerHistory());
}

/** DB-primary read. Falls back to localStorage cache when Supabase is unreachable. */
export async function fetchIncorrectQuestionIds(): Promise<string[]> {
  return computeIncorrectIds(await fetchAnswerHistory());
}

/**
 * Synchronous cache read. Prefer `fetchFirstTryIncorrectQuestionIds()` when possible.
 */
export function getFirstTryIncorrectQuestionIds(): string[] {
  return computeFirstTryIncorrectIds(getAnswerHistory());
}

/** DB-primary read. Falls back to localStorage cache when Supabase is unreachable. */
export async function fetchFirstTryIncorrectQuestionIds(): Promise<string[]> {
  return computeFirstTryIncorrectIds(await fetchAnswerHistory());
}

/**
 * Returns incorrect attempt counts by set/question identity.
 * Questions with no incorrect attempts are omitted.
 */
export async function fetchIncorrectQuestionCounts(): Promise<
  Record<string, number>
> {
  const counts = computeIncorrectCounts(await fetchAnswerHistory());
  return Object.fromEntries(counts.entries());
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.ANSWER_HISTORY);
  localStorage.removeItem(STORAGE_KEYS.BOOKMARKS);
  localStorage.removeItem(STORAGE_KEYS.SESSION_DATA);
}

function toDbAttempt(answer: StoredAnswer) {
  return {
    client_attempt_id: answer.clientAttemptId ?? null,
    question_id: answer.questionId,
    question_set_id: answer.questionSetId ?? null,
    question_content_version: answer.questionContentVersion ?? null,
    is_finalized: answer.isFinalized ?? true,
    question_completed: answer.questionCompleted ?? true,
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
        "question_id,question_set_id,question_content_version,selected_option_id,is_correct,is_finalized,question_completed,mode,module,topic,standard_id,standard_label,time_spent_sec,assignment_id,answered_at,client_attempt_id",
      )
      .order("answered_at", { ascending: true });
    if (error || !data) return getAnswerHistory();

    const answers: StoredAnswer[] = data.map((row) => ({
      questionId: String(row.question_id),
      questionSetId: row.question_set_id ? String(row.question_set_id) : undefined,
      questionContentVersion: row.question_content_version
        ? String(row.question_content_version)
        : undefined,
      selectedOptionId: String(row.selected_option_id),
      isCorrect: Boolean(row.is_correct),
      isFinalized: row.is_finalized !== false,
      questionCompleted: row.question_completed !== false,
      mode: String(row.mode),
      module: row.module ? Number(row.module) : undefined,
      topic: row.topic ? String(row.topic) : undefined,
      standardId: row.standard_id ? String(row.standard_id) : undefined,
      standardLabel: row.standard_label ? String(row.standard_label) : undefined,
      timeSpentSec:
        typeof row.time_spent_sec === "number" && Number.isFinite(row.time_spent_sec)
          ? Number(row.time_spent_sec)
          : undefined,
      assignmentId: row.assignment_id ? String(row.assignment_id) : undefined,
      timestamp: new Date(String(row.answered_at)).getTime(),
      clientAttemptId: row.client_attempt_id ? String(row.client_attempt_id) : undefined,
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
      const rows = localAnswers.map((answer) => toDbAttempt(withAttemptId(answer)));
      await supabase
        .from("attempts")
        .upsert(rows, { onConflict: "client_attempt_id", ignoreDuplicates: true });
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
