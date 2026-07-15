import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/types/question";
import type { ShortAnswerItem } from "@/types/short-answer";
import {
  clearQuestionMediaCache,
  fetchQuestionMedia,
  mergeQuestionMedia,
  questionNeedsMedia,
} from "@/lib/question-media";

function baseQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    module: 1,
    topic: "Genetics",
    text: "What is DNA?",
    imageUrl: null,
    options: [],
    correctOptionId: "a",
    source: "generated",
    questionSetId: "set-1",
    ...overrides,
  };
}

function illustrationShortAnswer(imageB64?: string): ShortAnswerItem {
  return {
    stem: "Explain the diagram.",
    stimulus: {
      type: "illustration",
      illustrationPrompt: "A cell diagram",
      ...(imageB64 ? { imageB64 } : {}),
    },
    parts: [],
  } as unknown as ShortAnswerItem;
}

describe("questionNeedsMedia", () => {
  it("is true when an image was stripped and is still missing", () => {
    expect(questionNeedsMedia(baseQuestion({ hasImage: true }))).toBe(true);
  });

  it("is false once the image is present", () => {
    expect(
      questionNeedsMedia(
        baseQuestion({ hasImage: true, imageUrl: "data:image/png;base64,x" }),
      ),
    ).toBe(false);
  });

  it("is true when the stimulus illustration is missing its image", () => {
    expect(
      questionNeedsMedia(
        baseQuestion({
          hasStimulusImage: true,
          shortAnswer: illustrationShortAnswer(),
        }),
      ),
    ).toBe(true);
  });

  it("is false for questions without a set id or without flags", () => {
    expect(
      questionNeedsMedia(baseQuestion({ hasImage: true, questionSetId: undefined })),
    ).toBe(false);
    expect(questionNeedsMedia(baseQuestion())).toBe(false);
  });
});

describe("mergeQuestionMedia", () => {
  it("fills in the image and the stimulus image without mutating the input", () => {
    const question = baseQuestion({
      hasImage: true,
      hasStimulusImage: true,
      shortAnswer: illustrationShortAnswer(),
    });

    const merged = mergeQuestionMedia(question, {
      imageUrl: "data:image/png;base64,img",
      stimulusImageB64: "stim",
    });

    expect(merged.imageUrl).toBe("data:image/png;base64,img");
    expect(
      merged.shortAnswer?.stimulus.type === "illustration" &&
        merged.shortAnswer.stimulus.imageB64,
    ).toBe("stim");
    expect(question.imageUrl).toBeNull();
    expect(
      question.shortAnswer?.stimulus.type === "illustration" &&
        question.shortAnswer.stimulus.imageB64,
    ).toBeUndefined();
  });

  it("does not overwrite media that is already present", () => {
    const question = baseQuestion({ imageUrl: "existing" });
    const merged = mergeQuestionMedia(question, {
      imageUrl: "other",
      stimulusImageB64: null,
    });
    expect(merged.imageUrl).toBe("existing");
  });
});

describe("fetchQuestionMedia", () => {
  beforeEach(() => {
    clearQuestionMediaCache();
  });

  function clientWithRpc(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
    return { rpc } as unknown as SupabaseClient;
  }

  it("calls the media RPC and caches the result per question", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ image_url: "data:image/png;base64,img", stimulus_image_b64: null }],
      error: null,
    });
    const supabase = clientWithRpc(rpc);

    const first = await fetchQuestionMedia(supabase, "set-1", "q1");
    const second = await fetchQuestionMedia(supabase, "set-1", "q1");

    expect(first).toEqual({
      imageUrl: "data:image/png;base64,img",
      stimulusImageB64: null,
    });
    expect(second).toBe(first);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_self_practice_question_media", {
      p_set_id: "set-1",
      p_question_id: "q1",
    });
  });

  it("returns null and allows a retry when the RPC fails", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } })
      .mockResolvedValueOnce({
        data: [{ image_url: "ok", stimulus_image_b64: null }],
        error: null,
      });
    const supabase = clientWithRpc(rpc);

    await expect(fetchQuestionMedia(supabase, "set-1", "q1")).resolves.toBeNull();
    await expect(fetchQuestionMedia(supabase, "set-1", "q1")).resolves.toEqual({
      imageUrl: "ok",
      stimulusImageB64: null,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
