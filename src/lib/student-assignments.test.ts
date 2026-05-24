import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/types/question";
import {
  deterministicShuffle,
  getStudentAssignmentList,
  pickNextStudentAction,
  resolveReviewQuestionsForAssignment,
  type StudentAssignmentListItem,
} from "@/lib/student-assignments";

const adminClientState = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    if (!adminClientState.client) {
      throw new Error("Test admin client is not configured.");
    }
    return adminClientState.client;
  },
}));

type Rows = Record<string, unknown[]>;

interface TableBehavior {
  rows: unknown[];
  error?: { message: string } | null;
}

interface OrderClause {
  column: string;
  ascending: boolean;
}

function compareOrderValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  const leftDate = typeof left === "string" ? Date.parse(left) : Number.NaN;
  const rightDate = typeof right === "string" ? Date.parse(right) : Number.NaN;
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
    return leftDate - rightDate;
  }

  return String(left).localeCompare(String(right));
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
    const orderClauses: OrderClause[] = [];

    const applyFilters = () => {
      const filtered = (behavior.rows as Record<string, unknown>[]).filter((row) =>
        filters.every((f) => f(row)),
      );
      if (orderClauses.length === 0) return filtered;
      return [...filtered].sort((left, right) => {
        for (const clause of orderClauses) {
          const compared = compareOrderValues(
            left[clause.column],
            right[clause.column],
          );
          if (compared !== 0) {
            return clause.ascending ? compared : -compared;
          }
        }
        return 0;
      });
    };

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
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderClauses.push({
          column,
          ascending: options?.ascending !== false,
        });
        return builder;
      }),
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

  const client = {
    from: vi.fn((table: string) => builderFor(table)),
  } as unknown as SupabaseClient;
  adminClientState.client = client;
  return client;
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

  it("keeps questions that have at least one incorrect attempt in scope", async () => {
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
          is_correct: true,
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
    expect(result.questions.map((q) => q.id).sort()).toEqual(["q1", "q2"]);
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
      school_members: [
        {
          school_id: "school-1",
          student_user_id: "student-1",
        },
      ],
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
          school_id: "school-1",
          created_at: "2026-04-01T09:00:00.000Z",
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
      school_members: [
        {
          school_id: "school-1",
          student_user_id: "student-1",
        },
      ],
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
          school_id: "school-1",
          created_at: "2026-04-01T09:00:00.000Z",
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

function makePickAssignment(
  overrides: Partial<StudentAssignmentListItem> & {
    id: string;
    status: StudentAssignmentListItem["status"];
  },
): StudentAssignmentListItem {
  return {
    id: overrides.id,
    title: overrides.title ?? `Assignment ${overrides.id}`,
    due_date: overrides.due_date ?? null,
    topics: overrides.topics ?? ["Genetics"],
    target_minutes: overrides.target_minutes ?? 20,
    mode: overrides.mode ?? "practice",
    randomize_order: overrides.randomize_order ?? true,
    max_questions: overrides.max_questions ?? null,
    instructions: overrides.instructions ?? null,
    max_attempts: overrides.max_attempts ?? null,
    completed_attempts: overrides.completed_attempts ?? 0,
    status: overrides.status,
    last_completed_at: overrides.last_completed_at ?? null,
    progress: overrides.progress ?? { answered: 0, total: 10 },
  };
}

const PICK_NOW = new Date("2026-06-01T12:00:00.000Z");

describe("pickNextStudentAction", () => {
  it("returns self_practice when the student has no assignments", () => {
    const action = pickNextStudentAction([], { now: PICK_NOW });
    expect(action).toEqual({ type: "self_practice" });
  });

  it("returns self_practice when every assignment is already completed", () => {
    const completed = makePickAssignment({
      id: "as_done",
      status: "completed",
      last_completed_at: "2026-05-25T00:00:00.000Z",
    });
    const action = pickNextStudentAction([completed], { now: PICK_NOW });
    expect(action).toEqual({ type: "self_practice" });
  });

  it("picks the only incomplete assignment when there is one", () => {
    const next = makePickAssignment({
      id: "as_open",
      status: "not_started",
      due_date: "2026-06-10T00:00:00.000Z",
    });
    const action = pickNextStudentAction([next], { now: PICK_NOW });
    expect(action.type).toBe("assignment");
    if (action.type !== "assignment") return;
    expect(action.assignment.id).toBe("as_open");
  });

  it("prefers an overdue assignment over an upcoming one", () => {
    const overdue = makePickAssignment({
      id: "as_overdue",
      status: "in_progress",
      due_date: "2026-05-25T00:00:00.000Z",
    });
    const upcoming = makePickAssignment({
      id: "as_future",
      status: "not_started",
      due_date: "2026-06-08T00:00:00.000Z",
    });
    const action = pickNextStudentAction([upcoming, overdue], { now: PICK_NOW });
    expect(action.type).toBe("assignment");
    if (action.type !== "assignment") return;
    expect(action.assignment.id).toBe("as_overdue");
  });

  it("among multiple overdue assignments, picks the one closest to now (most recently overdue)", () => {
    const recentlyOverdue = makePickAssignment({
      id: "as_recent",
      status: "in_progress",
      due_date: "2026-05-31T00:00:00.000Z",
    });
    const deeplyOverdue = makePickAssignment({
      id: "as_stale",
      status: "in_progress",
      due_date: "2026-04-01T00:00:00.000Z",
    });
    const action = pickNextStudentAction(
      [deeplyOverdue, recentlyOverdue],
      { now: PICK_NOW },
    );
    expect(action.type).toBe("assignment");
    if (action.type !== "assignment") return;
    expect(action.assignment.id).toBe("as_recent");
  });

  it("among upcoming assignments, picks the soonest due date", () => {
    const soon = makePickAssignment({
      id: "as_soon",
      status: "not_started",
      due_date: "2026-06-03T00:00:00.000Z",
    });
    const later = makePickAssignment({
      id: "as_later",
      status: "not_started",
      due_date: "2026-06-15T00:00:00.000Z",
    });
    const action = pickNextStudentAction([later, soon], { now: PICK_NOW });
    expect(action.type).toBe("assignment");
    if (action.type !== "assignment") return;
    expect(action.assignment.id).toBe("as_soon");
  });

  it("prefers dated assignments over undated ones", () => {
    const dated = makePickAssignment({
      id: "as_dated",
      status: "not_started",
      due_date: "2026-07-01T00:00:00.000Z",
    });
    const undated = makePickAssignment({
      id: "as_undated",
      status: "not_started",
      due_date: null,
    });
    const action = pickNextStudentAction([undated, dated], { now: PICK_NOW });
    expect(action.type).toBe("assignment");
    if (action.type !== "assignment") return;
    expect(action.assignment.id).toBe("as_dated");
  });

  it("falls back to undated incomplete assignments when there are no dated ones", () => {
    const a = makePickAssignment({ id: "as_a", status: "not_started" });
    const b = makePickAssignment({ id: "as_b", status: "in_progress" });
    const action = pickNextStudentAction([b, a], { now: PICK_NOW });
    expect(action.type).toBe("assignment");
    if (action.type !== "assignment") return;
    // Deterministic tie-break by id.
    expect(action.assignment.id).toBe("as_a");
  });

  it("excludes the just-finished assignment from candidates", () => {
    const justFinished = makePickAssignment({
      id: "as_just",
      status: "in_progress",
      due_date: "2026-05-30T00:00:00.000Z",
    });
    const other = makePickAssignment({
      id: "as_other",
      status: "not_started",
      due_date: "2026-06-15T00:00:00.000Z",
    });
    const action = pickNextStudentAction([justFinished, other], {
      now: PICK_NOW,
      excludeAssignmentId: "as_just",
    });
    expect(action.type).toBe("assignment");
    if (action.type !== "assignment") return;
    expect(action.assignment.id).toBe("as_other");
  });

  it("falls back to self_practice when excluding the only incomplete assignment", () => {
    const lone = makePickAssignment({
      id: "as_lone",
      status: "in_progress",
      due_date: "2026-06-10T00:00:00.000Z",
    });
    const action = pickNextStudentAction([lone], {
      now: PICK_NOW,
      excludeAssignmentId: "as_lone",
    });
    expect(action).toEqual({ type: "self_practice" });
  });

  it("ignores invalid due_date strings (treats them as no due date)", () => {
    const malformed = makePickAssignment({
      id: "as_bad",
      status: "not_started",
      due_date: "not-a-date",
    });
    const dated = makePickAssignment({
      id: "as_dated",
      status: "not_started",
      due_date: "2026-06-15T00:00:00.000Z",
    });
    const action = pickNextStudentAction([malformed, dated], { now: PICK_NOW });
    expect(action.type).toBe("assignment");
    if (action.type !== "assignment") return;
    // The dated assignment outranks the malformed one because the malformed
    // value is treated as "no_due" — a lower priority bucket than "due".
    expect(action.assignment.id).toBe("as_dated");
  });
});
