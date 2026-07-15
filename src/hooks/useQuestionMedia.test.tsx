// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Question } from "@/types/question";
import { useQuestionMedia } from "@/hooks/useQuestionMedia";
import { clearQuestionMediaCache } from "@/lib/question-media";

const rpcMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: rpcMock }),
}));

function baseQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    module: 1,
    topic: "Genetics",
    text: "What structure is shown?",
    imageUrl: null,
    options: [],
    correctOptionId: "a",
    source: "generated",
    questionSetId: "set-1",
    ...overrides,
  };
}

describe("useQuestionMedia", () => {
  beforeEach(() => {
    clearQuestionMediaCache();
    rpcMock.mockReset();
  });

  it("returns the question untouched when no media was stripped", () => {
    const question = baseQuestion();
    const { result } = renderHook(() => useQuestionMedia(question));
    expect(result.current.question).toBe(question);
    expect(result.current.isMediaPending).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("is pending while fetching, then merges the loaded image", async () => {
    let resolveRpc!: (value: unknown) => void;
    rpcMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRpc = resolve;
      }),
    );
    const question = baseQuestion({ hasImage: true });

    const { result } = renderHook(() => useQuestionMedia(question));
    expect(result.current.isMediaPending).toBe(true);
    expect(result.current.question?.imageUrl).toBeNull();

    resolveRpc({
      data: [{ image_url: "data:image/png;base64,img", stimulus_image_b64: null }],
      error: null,
    });

    await waitFor(() => {
      expect(result.current.isMediaPending).toBe(false);
    });
    expect(result.current.question?.imageUrl).toBe("data:image/png;base64,img");
  });

  it("clears pending on fetch failure instead of blocking forever", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const question = baseQuestion({ hasImage: true });

    const { result } = renderHook(() => useQuestionMedia(question));
    expect(result.current.isMediaPending).toBe(true);

    await waitFor(() => {
      expect(result.current.isMediaPending).toBe(false);
    });
    expect(result.current.question?.imageUrl).toBeNull();
  });
});
