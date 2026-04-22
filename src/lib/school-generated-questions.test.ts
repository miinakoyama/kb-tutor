import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteSchoolQuestionSetLink,
  upsertSchoolQuestionSetLinks,
} from "@/lib/school-generated-questions";

describe("upsertSchoolQuestionSetLinks", () => {
  it("returns null error when entries are empty", async () => {
    const supabase = {
      from: vi.fn(),
    } as unknown as SupabaseClient;
    const result = await upsertSchoolQuestionSetLinks(supabase, "set-1", []);
    expect(result).toEqual({ error: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("builds an upsert payload with the correct conflict target", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await upsertSchoolQuestionSetLinks(supabase, "set-1", [
      { schoolId: "school-a" },
      { schoolId: "school-b" },
    ]);

    expect(result).toEqual({ error: null });
    expect(from).toHaveBeenCalledWith("school_question_sets");
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          school_id: "school-a",
          set_id: "set-1",
          available_for_self_practice: true,
        },
        {
          school_id: "school-b",
          set_id: "set-1",
          available_for_self_practice: true,
        },
      ],
      { onConflict: "school_id,set_id" },
    );
  });

  it("surfaces error messages from Supabase", async () => {
    const upsert = vi.fn().mockResolvedValue({
      error: { message: "FK violation" },
    });
    const from = vi.fn(() => ({ upsert }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await upsertSchoolQuestionSetLinks(supabase, "set-1", [
      { schoolId: "school-a" },
    ]);
    expect(result).toEqual({ error: "FK violation" });
  });
});

describe("deleteSchoolQuestionSetLink", () => {
  it("issues a scoped delete and returns no error on success", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ delete: del }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await deleteSchoolQuestionSetLink(
      supabase,
      "school-a",
      "set-1",
    );

    expect(result).toEqual({ error: null });
    expect(from).toHaveBeenCalledWith("school_question_sets");
    expect(eq1).toHaveBeenCalledWith("school_id", "school-a");
    expect(eq2).toHaveBeenCalledWith("set_id", "set-1");
  });

  it("returns the error message when the delete fails", async () => {
    const eq2 = vi.fn().mockResolvedValue({
      error: { message: "not permitted" },
    });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ delete: del }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await deleteSchoolQuestionSetLink(
      supabase,
      "school-a",
      "set-1",
    );
    expect(result).toEqual({ error: "not permitted" });
  });
});
