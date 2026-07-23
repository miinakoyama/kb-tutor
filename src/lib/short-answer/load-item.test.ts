import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";
import {
  loadShortAnswerPart,
  ShortAnswerItemLoadError,
} from "./load-item";

type QueryResult = {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
};

function mockClient(
  result: QueryResult,
  listResult: { data: Array<{ payload: unknown }>; error: null } = {
    data: [],
    error: null,
  },
) {
  const builder: Record<string, unknown> = {};
  const select = vi.fn(() => builder);
  const eq = vi.fn(() => builder);
  const is = vi.fn(() => builder);
  const maybeSingle = vi.fn(async () => result);
  builder.select = select;
  builder.eq = eq;
  builder.is = is;
  builder.maybeSingle = maybeSingle;
  Object.defineProperty(builder, "then", {
    value: (resolve: (value: typeof listResult) => void) => resolve(listResult),
  });
  const from = vi.fn(() => builder);
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    eq,
    is,
  };
}

describe("loadShortAnswerPart", () => {
  it("loads a Self Practice SAQ by its complete composite key", async () => {
    const item = sampleItem as ShortAnswerItem;
    const { client, from, select, eq } = mockClient({
      data: {
        payload_lean: {
          questionType: "open-ended",
          shortAnswer: item,
        },
      },
      error: null,
    });

    const loaded = await loadShortAnswerPart(client, {
      questionId: "saq-1",
      questionSetId: "set-1",
      partLabel: "A",
    });

    expect(from).toHaveBeenCalledWith("generated_questions");
    expect(select).toHaveBeenCalledWith("payload_lean");
    expect(eq).toHaveBeenCalledWith("id", "saq-1");
    expect(eq).toHaveBeenCalledWith("set_id", "set-1");
    expect(loaded).toEqual({ item, part: item.parts[0] });
  });

  it("loads a legacy SAQ after removing reused key-term definitions", async () => {
    const item = structuredClone(sampleItem) as ShortAnswerItem;
    const reusedDefinition = "One old KC statement reused for every term.";
    item.keyTerms = [
      { term: "prokaryotic", definition: reusedDefinition },
      { term: "eukaryotic", definition: reusedDefinition },
    ];
    const { client } = mockClient({
      data: {
        payload_lean: {
          questionType: "open-ended",
          shortAnswer: item,
        },
      },
      error: null,
    });

    const loaded = await loadShortAnswerPart(client, {
      questionId: "saq-legacy",
      questionSetId: "set-legacy",
      partLabel: "A",
    });

    expect(loaded?.item.keyTerms).toEqual([]);
    expect(loaded?.part.label).toBe("A");
  });

  it("surfaces database lookup errors instead of treating them as a missing item", async () => {
    const { client } = mockClient({
      data: null,
      error: {
        message: "canceling statement due to statement timeout",
        code: "57014",
      },
    });

    await expect(
      loadShortAnswerPart(client, {
        questionId: "saq-1",
        questionSetId: "set-1",
        partLabel: "A",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ShortAnswerItemLoadError>>({
        name: "ShortAnswerItemLoadError",
        code: "57014",
      }),
    );
  });

  it("loads an assignment snapshot by question set as well as question id", async () => {
    const item = sampleItem as ShortAnswerItem;
    const payload = {
      id: "saq-1",
      questionSetId: "set-b",
      questionType: "open-ended",
      shortAnswer: item,
    };
    const { client, eq } = mockClient({
      data: { payload },
      error: null,
    });

    const loaded = await loadShortAnswerPart(client, {
      assignmentId: "assignment-1",
      questionId: "saq-1",
      questionSetId: "set-b",
      partLabel: "A",
    });

    expect(eq).toHaveBeenCalledWith("assignment_id", "assignment-1");
    expect(eq).toHaveBeenCalledWith("question_id", "saq-1");
    expect(eq).toHaveBeenCalledWith("payload->>questionSetId", "set-b");
    expect(loaded).toEqual({ item, part: item.parts[0] });
  });

  it("disambiguates legacy snapshot fallback rows by question set", async () => {
    const item = sampleItem as ShortAnswerItem;
    const payloadFor = (questionSetId: string) => ({
      id: "saq-1",
      questionSetId,
      questionType: "open-ended",
      shortAnswer: { ...item, stem: `Stem for ${questionSetId}` },
    });
    const { client } = mockClient(
      { data: null, error: null },
      {
        data: [
          { payload: payloadFor("set-a") },
          { payload: payloadFor("set-b") },
        ],
        error: null,
      },
    );

    const loaded = await loadShortAnswerPart(client, {
      assignmentId: "assignment-1",
      questionId: "saq-1",
      questionSetId: "set-b",
      partLabel: "A",
    });

    expect(loaded?.item.stem).toBe("Stem for set-b");
  });

  it("falls back to generated_questions for review assignments without snapshots", async () => {
    const item = sampleItem as ShortAnswerItem;
    const from = vi.fn((table: string) => {
      if (table === "assignment_question_snapshots") {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.is = vi.fn(chain);
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        Object.defineProperty(builder, "then", {
          value: (resolve: (value: { data: []; error: null }) => void) =>
            resolve({ data: [], error: null }),
        });
        return builder;
      }
      if (table === "assignments") {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.maybeSingle = vi.fn(async () => ({
          data: { mode: "review" },
          error: null,
        }));
        return builder;
      }
      if (table === "generated_questions") {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.maybeSingle = vi.fn(async () => ({
          data: {
            payload_lean: {
              questionType: "open-ended",
              shortAnswer: item,
            },
          },
          error: null,
        }));
        return builder;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const loaded = await loadShortAnswerPart(
      { from } as unknown as SupabaseClient,
      {
        assignmentId: "assignment-review",
        questionId: "saq-1",
        questionSetId: "set-1",
        partLabel: "A",
      },
    );

    expect(from).toHaveBeenCalledWith("generated_questions");
    expect(loaded).toEqual({ item, part: item.parts[0] });
  });

  it("does not fall back to generated_questions for practice assignments without snapshots", async () => {
    const from = vi.fn((table: string) => {
      if (table === "assignment_question_snapshots") {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.is = vi.fn(chain);
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        Object.defineProperty(builder, "then", {
          value: (resolve: (value: { data: []; error: null }) => void) =>
            resolve({ data: [], error: null }),
        });
        return builder;
      }
      if (table === "assignments") {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.maybeSingle = vi.fn(async () => ({
          data: { mode: "practice" },
          error: null,
        }));
        return builder;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const loaded = await loadShortAnswerPart(
      { from } as unknown as SupabaseClient,
      {
        assignmentId: "assignment-practice",
        questionId: "saq-1",
        questionSetId: "set-1",
        partLabel: "A",
      },
    );

    expect(from).not.toHaveBeenCalledWith("generated_questions");
    expect(loaded).toBeNull();
  });
});
