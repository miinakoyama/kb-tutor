import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/types/question";

/**
 * Lazy loading of heavy question media (base64 images) that the Self Practice
 * list RPC strips from payloads. `get_self_practice_questions` marks stripped
 * rows with `hasImage` / `hasStimulusImage`; when such a question is displayed,
 * `get_self_practice_question_media` returns the media for that single row.
 */

export type QuestionMedia = {
  imageUrl: string | null;
  stimulusImageB64: string | null;
};

type MediaRpcRow = {
  image_url: string | null;
  stimulus_image_b64: string | null;
};

const mediaCache = new Map<string, Promise<QuestionMedia | null>>();

export function clearQuestionMediaCache(): void {
  mediaCache.clear();
}

/** True when the question was served with media stripped and it is still missing. */
export function questionNeedsMedia(question: Question): boolean {
  if (!question.questionSetId) return false;
  if (question.hasImage && !question.imageUrl) return true;
  if (question.hasStimulusImage) {
    const stimulus = question.shortAnswer?.stimulus;
    if (stimulus?.type === "illustration" && !stimulus.imageB64) return true;
  }
  return false;
}

/** Fetch (and memoize) the stripped media for one question. Resolves to null on error. */
export function fetchQuestionMedia(
  supabase: SupabaseClient,
  setId: string,
  questionId: string,
): Promise<QuestionMedia | null> {
  const key = `${setId}/${questionId}`;
  const cached = mediaCache.get(key);
  if (cached) return cached;

  const pending: Promise<QuestionMedia | null> = Promise.resolve(
    supabase
      .rpc("get_self_practice_question_media", {
        p_set_id: setId,
        p_question_id: questionId,
      }),
  ).then(({ data, error }) => {
    const row: MediaRpcRow | undefined = Array.isArray(data)
      ? (data[0] as MediaRpcRow | undefined)
      : undefined;
    if (error || !row) {
      mediaCache.delete(key);
      return null;
    }
    return {
      imageUrl: typeof row.image_url === "string" ? row.image_url : null,
      stimulusImageB64:
        typeof row.stimulus_image_b64 === "string"
          ? row.stimulus_image_b64
          : null,
    };
  });

  mediaCache.set(key, pending);
  return pending;
}

/** Return a copy of the question with the fetched media filled in. */
export function mergeQuestionMedia(
  question: Question,
  media: QuestionMedia,
): Question {
  let next = question;

  if (media.imageUrl && !next.imageUrl) {
    next = { ...next, imageUrl: media.imageUrl };
  }

  const stimulus = next.shortAnswer?.stimulus;
  if (
    media.stimulusImageB64 &&
    next.shortAnswer &&
    stimulus?.type === "illustration" &&
    !stimulus.imageB64
  ) {
    next = {
      ...next,
      shortAnswer: {
        ...next.shortAnswer,
        stimulus: { ...stimulus, imageB64: media.stimulusImageB64 },
      },
    };
  }

  return next;
}
