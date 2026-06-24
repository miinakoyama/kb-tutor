import { describe, expect, it, vi } from "vitest";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveTeacherRoster,
  TeacherRosterLookupError,
} from "@/lib/analytics/teacher-roster";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type QueryResult = { data: unknown[] | null; error: unknown };

function makeAdminClient(results: Record<string, QueryResult[]>): AdminClient {
  return {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(async () => shiftResult(results, table)),
        in: vi.fn(async () => shiftResult(results, table)),
        order: vi.fn(async () => shiftResult(results, table)),
      };
      return builder;
    }),
  } as unknown as AdminClient;
}

function shiftResult(
  results: Record<string, QueryResult[]>,
  table: string,
): QueryResult {
  const next = results[table]?.shift();
  if (!next) {
    throw new Error(`Missing mocked result for ${table}`);
  }
  return next;
}

describe("resolveTeacherRoster", () => {
  it("keeps every school membership for a student", async () => {
    const admin = makeAdminClient({
      schools: [
        {
          data: [{ id: "school-a" }, { id: "school-b" }],
          error: null,
        },
        {
          data: [
            { id: "school-a", name: "School A" },
            { id: "school-b", name: "School B" },
          ],
          error: null,
        },
      ],
      school_members: [
        {
          data: [
            { school_id: "school-a", student_user_id: "student-1" },
            { school_id: "school-b", student_user_id: "student-1" },
          ],
          error: null,
        },
      ],
      profiles: [
        {
          data: [
            {
              id: "student-1",
              display_name: "Student One",
              student_id: "S1",
              excluded_from_analytics: false,
            },
          ],
          error: null,
        },
      ],
    });

    const roster = await resolveTeacherRoster(admin, "admin-1", "admin");

    expect(roster.scopedStudents).toEqual([
      {
        id: "student-1",
        label: "Student One",
        classId: "school-a",
        classIds: ["school-a", "school-b"],
      },
    ]);
  });

  it("propagates school_members lookup failures", async () => {
    const admin = makeAdminClient({
      schools: [
        {
          data: [{ id: "school-a" }],
          error: null,
        },
        {
          data: [{ id: "school-a", name: "School A" }],
          error: null,
        },
      ],
      school_members: [
        {
          data: null,
          error: { message: "RLS failure" },
        },
      ],
    });

    await expect(resolveTeacherRoster(admin, "admin-1", "admin")).rejects.toBeInstanceOf(
      TeacherRosterLookupError,
    );
  });
});
