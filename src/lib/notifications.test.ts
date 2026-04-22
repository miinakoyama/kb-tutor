import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStudentNotifications } from "@/lib/notifications";

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

interface TableBehavior {
  rows: Record<string, unknown>[];
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
  const leftDate = typeof left === "string" ? Date.parse(left) : Number.NaN;
  const rightDate = typeof right === "string" ? Date.parse(right) : Number.NaN;
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
    return leftDate - rightDate;
  }
  return String(left).localeCompare(String(right));
}

function makeSupabaseMock(
  tables: Record<string, TableBehavior>,
): SupabaseClient {
  const builderFor = (table: string) => {
    const behavior = tables[table] ?? { rows: [] };
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const orderClauses: OrderClause[] = [];
    const applyFilters = () =>
      [...behavior.rows.filter((row) => filters.every((f) => f(row)))].sort(
        (left, right) => {
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
        },
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
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderClauses.push({
          column,
          ascending: options?.ascending !== false,
        });
        return builder;
      }),
      maybeSingle: vi.fn(async () => ({
        data: applyFilters()[0] ?? null,
        error: behavior.error ?? null,
      })),
    };
    Object.defineProperty(builder, "then", {
      value: (
        resolve: (value: { data: unknown; error: unknown }) => void,
      ) => {
        resolve({
          data: behavior.error ? [] : applyFilters(),
          error: behavior.error ?? null,
        });
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

const REAL_DATE_NOW = Date.now;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Date.now = REAL_DATE_NOW;
});

describe("getStudentNotifications", () => {
  it("returns an empty result with no targets", async () => {
    const supabase = makeSupabaseMock({
      school_members: {
        rows: [{ school_id: "school-1", student_user_id: "student-1" }],
      },
      assignment_targets: { rows: [] },
      assignments: { rows: [] },
    });
    const result = await getStudentNotifications(supabase, "student-1");
    expect(result.error).toBeNull();
    expect(result.notifications).toEqual([]);
    expect(result.assignmentTargetCount).toBe(0);
  });

  it("emits assignment-assigned notifications for each target", async () => {
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));
    const supabase = makeSupabaseMock({
      school_members: {
        rows: [{ school_id: "school-1", student_user_id: "student-1" }],
      },
      assignment_targets: {
        rows: [
          {
            assignment_id: "as_1",
            created_at: "2026-04-15T10:00:00.000Z",
            student_user_id: "student-1",
          },
        ],
      },
      assignments: {
        rows: [
          {
            id: "as_1",
            school_id: "school-1",
            title: "Cell Quiz",
            due_date: null,
            created_at: "2026-04-15T09:00:00.000Z",
          },
        ],
      },
    });

    const result = await getStudentNotifications(supabase, "student-1", {
      lastReadAt: null,
    });
    expect(result.error).toBeNull();
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].kind).toBe("assignment_assigned");
    expect(result.notifications[0].message).toContain("Cell Quiz");
    expect(result.notifications[0].read).toBe(false);
  });

  it("emits a due-soon notification when within 48 hours of the due date", async () => {
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));
    const dueInDay = new Date("2026-04-21T10:00:00.000Z").toISOString();
    const supabase = makeSupabaseMock({
      school_members: {
        rows: [{ school_id: "school-1", student_user_id: "student-1" }],
      },
      assignment_targets: {
        rows: [
          {
            assignment_id: "as_1",
            created_at: "2026-04-15T10:00:00.000Z",
            student_user_id: "student-1",
          },
        ],
      },
      assignments: {
        rows: [
          {
            id: "as_1",
            school_id: "school-1",
            title: "Quick Check",
            due_date: dueInDay,
            created_at: "2026-04-15T09:00:00.000Z",
          },
        ],
      },
    });
    const result = await getStudentNotifications(supabase, "student-1");
    const kinds = result.notifications.map((n) => n.kind).sort();
    expect(kinds).toEqual(["assignment_assigned", "assignment_due_soon"]);
  });

  it("does not emit due-soon when the assignment is already past due", async () => {
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));
    const supabase = makeSupabaseMock({
      school_members: {
        rows: [{ school_id: "school-1", student_user_id: "student-1" }],
      },
      assignment_targets: {
        rows: [
          {
            assignment_id: "as_1",
            created_at: "2026-04-15T10:00:00.000Z",
            student_user_id: "student-1",
          },
        ],
      },
      assignments: {
        rows: [
          {
            id: "as_1",
            school_id: "school-1",
            title: "Overdue",
            due_date: "2026-04-19T10:00:00.000Z",
            created_at: "2026-04-15T09:00:00.000Z",
          },
        ],
      },
    });
    const result = await getStudentNotifications(supabase, "student-1");
    const kinds = result.notifications.map((n) => n.kind);
    expect(kinds).not.toContain("assignment_due_soon");
  });

  it("marks notifications as read when lastReadAt is after the notification's createdAt", async () => {
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));
    const supabase = makeSupabaseMock({
      school_members: {
        rows: [{ school_id: "school-1", student_user_id: "student-1" }],
      },
      assignment_targets: {
        rows: [
          {
            assignment_id: "as_1",
            created_at: "2026-04-15T10:00:00.000Z",
            student_user_id: "student-1",
          },
        ],
      },
      assignments: {
        rows: [
          {
            id: "as_1",
            school_id: "school-1",
            title: "Quiz",
            due_date: null,
            created_at: "2026-04-15T09:00:00.000Z",
          },
        ],
      },
    });

    const result = await getStudentNotifications(supabase, "student-1", {
      lastReadAt: "2026-04-16T00:00:00.000Z",
    });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].read).toBe(true);
  });

  it("sorts notifications newest first", async () => {
    vi.setSystemTime(new Date("2026-04-20T10:00:00.000Z"));
    const supabase = makeSupabaseMock({
      school_members: {
        rows: [{ school_id: "school-1", student_user_id: "student-1" }],
      },
      assignment_targets: {
        rows: [
          {
            assignment_id: "as_older",
            created_at: "2026-04-15T10:00:00.000Z",
            student_user_id: "student-1",
          },
          {
            assignment_id: "as_newer",
            created_at: "2026-04-18T10:00:00.000Z",
            student_user_id: "student-1",
          },
        ],
      },
      assignments: {
        rows: [
          {
            id: "as_older",
            school_id: "school-1",
            title: "Older",
            due_date: null,
            created_at: "2026-04-15T09:00:00.000Z",
          },
          {
            id: "as_newer",
            school_id: "school-1",
            title: "Newer",
            due_date: null,
            created_at: "2026-04-18T09:00:00.000Z",
          },
        ],
      },
    });

    const result = await getStudentNotifications(supabase, "student-1");
    expect(result.notifications.map((n) => n.message)).toEqual([
      expect.stringContaining("Newer"),
      expect.stringContaining("Older"),
    ]);
  });
});
