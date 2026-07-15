"use client";

import { useEffect, useMemo, useState } from "react";
import type { Question } from "@/types/question";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchQuestionMedia,
  mergeQuestionMedia,
  questionNeedsMedia,
  type QuestionMedia,
} from "@/lib/question-media";

export interface UseQuestionMediaResult {
  /** The input question, with stripped media merged in once it has loaded. */
  question: Question | null | undefined;
  /**
   * True while stripped media for this question is still being fetched.
   * Callers should hold answer input until this clears so students never
   * answer an image-dependent question before its illustration is visible.
   * Cleared on fetch failure too (the question then renders without media
   * rather than deadlocking; a remount retries the fetch).
   */
  isMediaPending: boolean;
}

/**
 * Fill in media stripped from Self Practice list payloads. Returns the
 * question as-is when nothing is missing; otherwise fetches the media for
 * that single question and returns a merged copy once it arrives.
 */
export function useQuestionMedia(
  question: Question | null | undefined,
): UseQuestionMediaResult {
  const setId = question?.questionSetId ?? null;
  const questionId = question?.id ?? null;
  const contentVersion = question?.contentVersion ?? null;
  const key =
    setId && questionId
      ? `${setId}/${questionId}/${contentVersion ?? "current"}`
      : null;
  const needsMedia = question ? questionNeedsMedia(question) : false;
  const [resolved, setResolved] = useState<{
    key: string;
    media: QuestionMedia | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !setId || !questionId || !needsMedia) return;
    let cancelled = false;
    void fetchQuestionMedia(
      getSupabaseBrowserClient(),
      setId,
      questionId,
      contentVersion,
    ).then((media) => {
      if (!cancelled) setResolved({ key, media });
    });
    return () => {
      cancelled = true;
    };
  }, [key, setId, questionId, contentVersion, needsMedia]);

  const loadedMedia =
    resolved && key && resolved.key === key ? resolved.media : null;

  const merged = useMemo(() => {
    if (!question || !needsMedia || !loadedMedia) return question;
    return mergeQuestionMedia(question, loadedMedia);
  }, [question, needsMedia, loadedMedia]);

  const isMediaPending =
    needsMedia && (!resolved || !key || resolved.key !== key);

  return { question: merged, isMediaPending };
}
