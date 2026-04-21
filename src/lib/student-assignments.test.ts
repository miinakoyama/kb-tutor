import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/types/question";
import {
  deterministicShuffle,
  getStudentAssignmentList,
  resolveReviewQuestionsForAssignment,
} from "@/lib/student-assignments";

type Rows = Record<string, unknown[]>;

interface TableBehavior {
  rows: unknown[];
  error?: { message: string } | null;
}

/**
 * Minimal Supabase mock that supports the chainable query builder surface used
 * by the code under test: `.from(table).select(...).eq(...).in(...).order(...).maybeSingle()`.
 * Filters are evaluated against `rows` in memory so tests can reason about the
 * final result set without patching every chain method.
 */
function makeSupabaseMock(tables: Rows): SupabaseClient {
  const builderFor = (table: string) => {
    const behavior: TableBehavior = { rows: tables[table] ?? [] };
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];

    const applyFilters = () =>
      (behavior.rows as Record<string, unknown>[]).filter((row) =>
        filters.every((f) => f(row)),
      );

    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        const set = new Set(values);
        filters.push((row) => set.has(row[column]));
        return builder;
      }),
      ilike: vi.fn(() => builder),
      order: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (behavior.error) return { data: null, error: behavior.error };
        const rows = applyFilters();
        return { data: rows[0] ?? null, error: null };
      }),
      single: vi.fn(async () => {
        if (behavior.error) return { data: null, error: behavior.error };
        const rows = applyFilters();
        return { data: rows[0] ?? null, error: null };
      }),
      then: undefined,
    };
    // Allow `await builder` (resolved Supabase queries are thenables)
    Object.defineProperty(builder, "then", {
      value: (resolve: (value: { data: unknown[]; error: unknown }) => void) => {
        if (behavior.error) {
          resolve({ data: [], error: behavior.error });
          return;
        }
        resolve({ data: applyFilters(), error: null });
      },
    });
    return builder;
  };

  return {
    from: vi.fn((table: string) => builderFor(table)),
  } as unknown as SupabaseClient;
}

describe("deterministicShuffle", () => {
  it("produces the same permutation for the same seed", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const first = deterministicShuffle(input, "seed-x");
    const second = deterministicShuffle(input, "seed-x");
    expect(second).toEqual(first);
  });

  it("differs between different seeds for non-trivial inputs", () => {
    const input = Array.from({ length: 10 }, (_, i) => i + 1);
    const a = deterministicShuffle(input, "seed-a");
    const b = deterministicShuffle(input, "seed-b");
    expect(a).not.toEqual(b);
  });

  it("preserves length and content of the input array", () => {
    const input = ["a", "b", "c", "d", "e"];
    const shuffled = deterministicShuffle(input, "seed");
    expect(shuffled.sort()).toEqual([...input].sort());
  });

  it("does not mutate the original array", () => {
    const input = [1, 2, 3];
    const snapshot = [...input];
    deterministicShuffle(input, "seed");
    expect(input).toEqual(snapshot);
  });

  it("handles empty and single-element inputs", () => {
    expect(deterministicShuffle([], "seed")).toEqual([]);
    expect(deterministicShuffle([42], "seed")).toEqual([42]);
  });
});

describe("resolveReviewQuestionsForAssignment", () => {
  const baseAssignment = {
    id: "as_1",
    mode: "review",
    randomize_order: true,
    max_questions: 10,
    review_topics: ["Genetics"],
    review_standards: ["3.1.9-12.P"],
  };

  it("returns an error when the assignment is not in review mode", async () => {
    const supabase = makeSupabaseMock({
      assignments: [{ ...baseAssignment, mode: "practice" }],
    });
    const result = await resolveReviewQuestionsForAssignment(
      supabase,
      "student-1",
      "as_1",
    );
    expect(result.error).toMatch(/not in review mode/i);
    expect(result.questions).toEqual([]);
  });

  it("returns an error when the assignment is not found", async () => {
    const supabase = makeSupabaseMock({ assignments: [] });
    const result = await resolveReviewQuestionsForAssignment(
      supabase,
      "student-1",
      "as_missing",
    );
    expect(result.error).toMatch(/not found/i);
  });

  it("returns no questions when the student has no incorrect attempts in scope", async () => {
    const supabase = makeSupabaseMock({
      assignments: [baseAssignment],
      attempts: [
        {
          user_id: "student-1",
          question_id: "q1",
          topic: "Genetics",
          standard_id: "3.1.9-12.P",
          is_correct: true,
          answered_at: "2026-04-01T10:00:00.000Z",
        },
      ],
    });
    const result = await resolveReviewQuestionsForAssignment(
      supabase,
      "student-1",
      "as_1",
    );
    expect(result.error).toBeNull();
    expect(result.questions).toEqual([]);
  });

  it("keeps only questions whose latest attempt was incorrect", async () => {
    const supabase = makeSupabaseMock({
      assignments: [baseAssignment],
      attempts: [
        {
          user_id: "student-1",
          question_id: "q1",
          topic: "Genetics",
          standard_id: "3.1.9-12.P",
          is_correct: false,
          answered_at: "2026-04-01T10:00:00.000Z",
        },
        {
          user_id: "student-1",
          question_id: "q1",
          topic: "Genetics",
          standard_id: "3.1.9-12.P",
          is_correct: true, // later correction should exclude q1
          answered_at: "2026-04-02T10:00:00.000Z",
        },
        {
          user_id: "student-1",
          question_id: "q2",
          topic: "Genetics",
          standard_id: "3.1.9-12.P",
          is_correct: false,
          answered_at: "2026-04-02T10:05:00.000Z",
        },
      ],
      generated_questions: [
        {
          id: "q1",
          payload: { id: "q1", text: "Q1" } as Question,
        },
        {
          id: "q2",
          payload: { id: "q2", text: "Q2" } as Question,
        },
      ],
    });

    const result = await resolveReviewQuestionsForAssignment(
      supabase,
      "student-1",
      "as_1",
    );
    expect(result.error).toBeNull();
    expect(result.questions.map((q) => q.id)).toEqual(["q2"]);
  });

  it("caps results at max_questions", async () => {
    const attempts = Array.from({ length: 5 }, (_, i) => ({
      user_id: "student-1",
      question_id: `q${i}`,
      topic: "Genetics",
      standard_id: "3.1.9-12.P",
      is_correct: false,
      answered_at: `2026-04-0${i + 1}T10:00:00.000Z`,
    }));
    const payloads = attempts.map((a) => ({
      id: a.question_id,
      payload: { id: a.question_id, text: `T${a.question_id}` } as Question,
    }));

    const supabase = makeSupabaseMock({
      assignments: [{ ...baseAssignment, max_questions: 2 }],
      attempts,
      generated_questions: payloads,
    });

    const result = await resolveReviewQuestionsForAssignment(
      supabase,
      "student-1",
      "as_1",
    );
    expect(result.error).toBeNull();
    expect(result.questions).toHaveLength(2);
  });
});

describe("getStudentAssignmentList", () => {
  it("returns an empty list when the student has no assignment targets", async () => {
    const supabase = makeSupabaseMock({ assignment_targets: [] });
    const result = await getStudentAssignmentList(supabase, "student-1");
    expect(result).toEqual({ assignments: [], error: null });
  });

  it("computes progress, status, and preserves assignment metadata", async () => {
    const supabase = makeSupabaseMock({
      assignment_targets: [
        {
          assignment_id: "as_1",
          student_user_id: "student-1",
          created_at: "2026-04-01T10:00:00.000Z",
          last_completed_at: null,
        },
      ],
      assignments: [
        {
          id: "as_1",
          title: "Quiz",
          due_date: null,
          module_ids: [1],
          topics: ["Genetics"],
          target_minutes: 20,
          mode: "practice",
          randomize_order: true,
          max_questions: null,
        },
      ],
      assignment_question_snapshots: [
        { assignment_id: "as_1", question_id: "q1" },
        { assignment_id: "as_1", question_id: "q2" },
      ],
      attempts: [
        {
          assignment_id: "as_1",
          question_id: "q1",
          user_id: "student-1",
          answered_at: "2026-04-02T10:00:00.000Z",
        },
      ],
    });

    const result = await getStudentAssignmentList(supabase, "student-1");
    expect(result.error).toBeNull();
    expect(result.assignments).toHaveLength(1);
    const item = result.assignments[0];
    expect(item.id).toBe("as_1");
    expect(item.status).toBe("in_progress");
    expect(item.progress).toEqual({ answered: 1, total: 2 });
    expect(item.mode).toBe("practice");
  });

  it("marks the assignment completed when last_completed_at is set and ignores prior attempts", async () => {
    const supabase = makeSupabaseMock({
      assignment_targets: [
        {
          assignment_id: "as_1",
          student_user_id: "student-1",
          created_at: "2026-04-01T10:00:00.000Z",
          last_completed_at: "2026-04-10T10:00:00.000Z",
        },
      ],
      assignments: [
        {
          id: "as_1",
          title: "Quiz",
          due_date: null,
          module_ids: [1],
          topics: ["Genetics"],
          target_minutes: 20,
          mode: "practice",
          randomize_order: true,
          max_questions: null,
        },
      ],
      assignment_question_snapshots: [
        { assignment_id: "as_1", question_id: "q1" },
        { assignment_id: "as_1", question_id: "q2" },
      ],
      // Attempt happened before completion: should not count for progress.
      attempts: [
        {
          assignment_id: "as_1",
          question_id: "q1",
          user_id: "student-1",
          answered_at: "2026-04-02T10:00:00.000Z",
        },
      ],
    });

    const result = await getStudentAssignmentList(supabase, "student-1");
    expect(result.assignments[0].status).toBe("completed");
    expect(result.assignments[0].progress.answered).toBe(0);
  });
});
