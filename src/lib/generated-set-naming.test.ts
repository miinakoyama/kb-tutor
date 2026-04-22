import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DUPLICATE_SET_NAME_MESSAGE,
  assertSetNameUniqueForSchools,
} from "@/lib/generated-set-naming";

function makeSupabase(
  tableRows: Record<string, unknown>[] | null,
  error: { message: string } | null = null,
): SupabaseClient {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn((column: string, values: unknown[]) => {
      const set = new Set(values);
      filters.push((row) => set.has(row[column]));
      return builder;
    }),
  } as Record<string, unknown>;

  Object.defineProperty(builder, "then", {
    value: (
      resolve: (value: { data: unknown; error: unknown }) => void,
    ) => {
      if (error) {
        resolve({ data: null, error });
        return;
      }
      const rows =
        tableRows?.filter((row) => filters.every((f) => f(row))) ?? [];
      resolve({ data: rows, error: null });
    },
  });
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient;
}

describe("assertSetNameUniqueForSchools", () => {
  it("passes when the name is empty (nothing to check)", async () => {
    const supabase = makeSupabase([]);
    const result = await assertSetNameUniqueForSchools(supabase, "   ", [
      "school-1",
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("passes when no schools are given", async () => {
    const supabase = makeSupabase([]);
    const result = await assertSetNameUniqueForSchools(
      supabase,
      "My Set",
      [],
    );
    expect(result).toEqual({ ok: true });
  });

  it("passes when no existing set has the same name", async () => {
    const supabase = makeSupabase([
      {
        set_id: "s1",
        school_id: "school-1",
        generated_question_sets: { id: "s1", name: "Other Set" },
      },
    ]);
    const result = await assertSetNameUniqueForSchools(
      supabase,
      "Module Quiz",
      ["school-1"],
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects a duplicate name (case-insensitive, whitespace-insensitive)", async () => {
    const supabase = makeSupabase([
      {
        set_id: "s1",
        school_id: "school-1",
        generated_question_sets: { id: "s1", name: "Module Quiz" },
      },
    ]);
    const result = await assertSetNameUniqueForSchools(
      supabase,
      "  module QUIZ  ",
      ["school-1"],
    );
    expect(result).toEqual({ ok: false, message: DUPLICATE_SET_NAME_MESSAGE });
  });

  it("allows reusing the name when the existing row is excluded by id", async () => {
    const supabase = makeSupabase([
      {
        set_id: "s1",
        school_id: "school-1",
        generated_question_sets: { id: "s1", name: "Module Quiz" },
      },
    ]);
    const result = await assertSetNameUniqueForSchools(
      supabase,
      "Module Quiz",
      ["school-1"],
      "s1",
    );
    expect(result).toEqual({ ok: true });
  });

  it("surfaces query errors", async () => {
    const supabase = makeSupabase(null, { message: "RLS blocked" });
    const result = await assertSetNameUniqueForSchools(supabase, "Quiz", [
      "school-1",
    ]);
    expect(result).toEqual({ ok: false, message: "RLS blocked" });
  });

  it("handles an array-shape join payload from PostgREST", async () => {
    const supabase = makeSupabase([
      {
        set_id: "s1",
        school_id: "school-1",
        generated_question_sets: [{ id: "s1", name: "Module Quiz" }],
      },
    ]);
    const result = await assertSetNameUniqueForSchools(
      supabase,
      "Module Quiz",
      ["school-1"],
    );
    expect(result.ok).toBe(false);
  });
});
