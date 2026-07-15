import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";
import {
  loadShortAnswerPart,
  ShortAnswerItemLoadError,
} from "./load-item";

function mockClient(result: {
  data: { payload_lean: unknown } | null;
  error: { message: string; code?: string } | null;
}) {
  const builder: Record<string, unknown> = {};
  const select = vi.fn(() => builder);
  const eq = vi.fn(() => builder);
  const maybeSingle = vi.fn(async () => result);
  builder.select = select;
  builder.eq = eq;
  builder.maybeSingle = maybeSingle;
  const from = vi.fn(() => builder);
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    eq,
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
});
