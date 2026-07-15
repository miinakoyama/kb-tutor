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

/**
 * Fill in media stripped from Self Practice list payloads. Returns the
 * question as-is when nothing is missing; otherwise fetches the media for
 * that single question and returns a merged copy once it arrives.
 */
export function useQuestionMedia(
  question: Question | null | undefined,
): Question | null | undefined {
  const setId = question?.questionSetId ?? null;
  const questionId = question?.id ?? null;
  const needsMedia = question ? questionNeedsMedia(question) : false;
  const [loaded, setLoaded] = useState<{
    key: string;
    media: QuestionMedia;
  } | null>(null);

  useEffect(() => {
    if (!setId || !questionId || !needsMedia) return;
    const key = `${setId}/${questionId}`;
    let cancelled = false;
    void fetchQuestionMedia(getSupabaseBrowserClient(), setId, questionId).then(
      (media) => {
        if (!cancelled && media) setLoaded({ key, media });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [setId, questionId, needsMedia]);

  return useMemo(() => {
    if (!question || !needsMedia) return question;
    if (!loaded || loaded.key !== `${setId}/${questionId}`) return question;
    return mergeQuestionMedia(question, loaded.media);
  }, [question, needsMedia, loaded, setId, questionId]);
}
