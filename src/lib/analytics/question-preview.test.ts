import { describe, expect, it } from "vitest";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  fetchQuestionPreviewsByIdentity,
  parseQuestionPreview,
  questionPreviewIdentityKey,
  resolveQuestionTypeFromAttempts,
} from "./question-preview";

describe("parseQuestionPreview", () => {
  it("returns null for non-object input", () => {
    expect(parseQuestionPreview(null)).toBeNull();
    expect(parseQuestionPreview("not an object")).toBeNull();
  });

  it("parses an MCQ payload", () => {
    const preview = parseQuestionPreview({
      text: "What is 2 + 2?",
      options: [
        { id: "opt_1", text: "3" },
        { id: "opt_2", text: "4" },
      ],
      correctOptionId: "opt_2",
    });
    expect(preview).toEqual({
      questionType: "mcq",
      text: "What is 2 + 2?",
      imageUrl: null,
      options: [
        { id: "opt_1", text: "3" },
        { id: "opt_2", text: "4" },
      ],
      correctOptionId: "opt_2",
    });
  });

  it("returns null for an MCQ payload with no options", () => {
    expect(
      parseQuestionPreview({ text: "Stemless question", options: [] }),
    ).toBeNull();
  });

  it("parses an open-ended (short-answer) payload", () => {
    const preview = parseQuestionPreview({
      questionType: "open-ended",
      shortAnswer: {
        stem: "Explain how enzymes affect reaction rate.",
        parts: [
          { label: "A", prompt: "Define the term 'catalyst'.", maxScore: 2 },
          { label: "B", prompt: "Explain the mechanism.", maxScore: 3 },
        ],
      },
    });
    expect(preview).toEqual({
      questionType: "open-ended",
      text: "Explain how enzymes affect reaction rate.",
      imageUrl: null,
      parts: [
        { label: "A", prompt: "Define the term 'catalyst'.", maxScore: 2 },
        { label: "B", prompt: "Explain the mechanism.", maxScore: 3 },
      ],
    });
  });

  it("returns null for an open-ended payload with no stem", () => {
    expect(
      parseQuestionPreview({
        questionType: "open-ended",
        shortAnswer: { stem: "", parts: [{ label: "A", prompt: "x", maxScore: 1 }] },
      }),
    ).toBeNull();
  });

  it("returns null for an open-ended payload with no valid parts", () => {
    expect(
      parseQuestionPreview({
        questionType: "open-ended",
        shortAnswer: {
          stem: "Some stem",
          parts: [{ label: "Z", prompt: "invalid label", maxScore: 1 }],
        },
      }),
    ).toBeNull();
  });
});

describe("questionPreviewIdentityKey", () => {
  it("keeps reused question ids distinct across generated sets", () => {
    expect(
      questionPreviewIdentityKey({
        questionId: "shared-question",
        questionSetId: "set-a",
      }),
    ).not.toBe(
      questionPreviewIdentityKey({
        questionId: "shared-question",
        questionSetId: "set-b",
      }),
    );
  });

  it("loads distinct previews when generated sets reuse a question id", async () => {
    const rows = [
      {
        id: "shared-question",
        set_id: "set-a",
        payload: {
          questionType: "open-ended",
          shortAnswer: {
            stem: "Set A stem",
            parts: [{ label: "A", prompt: "Set A prompt", maxScore: 1 }],
          },
        },
        updated_at: "2026-07-16T10:00:00.000Z",
      },
      {
        id: "shared-question",
        set_id: "set-b",
        payload: {
          questionType: "open-ended",
          shortAnswer: {
            stem: "Set B stem",
            parts: [{ label: "A", prompt: "Set B prompt", maxScore: 1 }],
          },
        },
        updated_at: "2026-07-16T11:00:00.000Z",
      },
    ];
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.in = chain;
    builder.order = chain;
    builder.range = async () => ({ data: rows, error: null });
    const admin = {
      from: () => builder,
    } as unknown as ReturnType<typeof createSupabaseAdminClient>;
    const identities = [
      { questionId: "shared-question", questionSetId: "set-a" },
      { questionId: "shared-question", questionSetId: "set-b" },
    ];

    const result = await fetchQuestionPreviewsByIdentity(admin, identities);

    expect(
      result.data.get(questionPreviewIdentityKey(identities[0]))?.text,
    ).toBe("Set A stem");
    expect(
      result.data.get(questionPreviewIdentityKey(identities[1]))?.text,
    ).toBe("Set B stem");
  });
});

describe("resolveQuestionTypeFromAttempts", () => {
  it("preserves a stored SAQ when its preview is unavailable", () => {
    expect(
      resolveQuestionTypeFromAttempts(
        [{ selected_option_id: "short-answer" }],
        null,
      ),
    ).toBe("open-ended");
  });

  it("prefers the durable attempt type over a conflicting preview", () => {
    const mcqPreview = parseQuestionPreview({
      text: "A reused question id",
      options: [{ id: "A", text: "Option A" }],
      correctOptionId: "A",
    });

    expect(
      resolveQuestionTypeFromAttempts(
        [{ selected_option_id: "short-answer" }],
        mcqPreview,
      ),
    ).toBe("open-ended");
  });
});
