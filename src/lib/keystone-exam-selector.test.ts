import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStudentKeystoneExam } from "@/lib/keystone-exam";

function makeSupabase(
  rows: Record<string, unknown>[] | null,
  error: { message: string } | null = null,
): SupabaseClient {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
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
      const filtered = rows?.filter((row) => filters.every((f) => f(row))) ?? [];
      resolve({ data: filtered, error: null });
    },
  });
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient;
}

describe("getStudentKeystoneExam", () => {
  it("returns null when the student has no enrolled schools", async () => {
    const supabase = makeSupabase([]);
    const result = await getStudentKeystoneExam(supabase, "student-1");
    expect(result).toBeNull();
  });

  it("returns null on query error", async () => {
    const supabase = makeSupabase(null, { message: "RLS" });
    const result = await getStudentKeystoneExam(supabase, "student-1");
    expect(result).toBeNull();
  });

  it("returns null when no enrolled school has an exam date configured", async () => {
    const supabase = makeSupabase([
      {
        school_id: "s1",
        student_user_id: "student-1",
        schools: { id: "s1", name: "School One", keystone_exam_date: null },
      },
    ]);
    const result = await getStudentKeystoneExam(supabase, "student-1");
    expect(result).toBeNull();
  });

  it("skips exams that are already in the past", async () => {
    const supabase = makeSupabase([
      {
        school_id: "s1",
        student_user_id: "student-1",
        schools: { id: "s1", name: "Past", keystone_exam_date: "2026-01-01" },
      },
    ]);
    const result = await getStudentKeystoneExam(supabase, "student-1", {
      now: new Date("2026-04-20T00:00:00.000Z"),
    });
    expect(result).toBeNull();
  });

  it("returns the nearest upcoming exam when multiple schools have dates", async () => {
    const supabase = makeSupabase([
      {
        school_id: "s1",
        student_user_id: "student-1",
        schools: {
          id: "s1",
          name: "Earlier",
          keystone_exam_date: "2026-05-10",
        },
      },
      {
        school_id: "s2",
        student_user_id: "student-1",
        schools: {
          id: "s2",
          name: "Later",
          keystone_exam_date: "2026-06-01",
        },
      },
    ]);
    const result = await getStudentKeystoneExam(supabase, "student-1", {
      now: new Date("2026-04-20T00:00:00.000Z"),
    });
    expect(result?.schoolId).toBe("s1");
    expect(result?.examDate).toBe("2026-05-10");
  });

  it("handles the join payload arriving as an array", async () => {
    const supabase = makeSupabase([
      {
        school_id: "s1",
        student_user_id: "student-1",
        schools: [
          {
            id: "s1",
            name: "Array Shape",
            keystone_exam_date: "2026-05-10",
          },
        ],
      },
    ]);
    const result = await getStudentKeystoneExam(supabase, "student-1", {
      now: new Date("2026-04-20T00:00:00.000Z"),
    });
    expect(result?.examDate).toBe("2026-05-10");
  });
});
