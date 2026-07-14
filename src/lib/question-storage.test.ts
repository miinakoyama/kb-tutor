import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => false }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: vi.fn() }));

import { getAllGeneratedQuestionSets, getGeneratedQuestionSetById } from "@/lib/question-storage";

describe("remote-only question storage", () => {
  it("returns an empty collection instead of bundled fallback questions", async () => {
    await expect(getAllGeneratedQuestionSets()).resolves.toEqual({ questions: [], questionSets: [] });
    await expect(getGeneratedQuestionSetById("missing")).resolves.toEqual({ questions: [], questionSet: null });
  });
});
