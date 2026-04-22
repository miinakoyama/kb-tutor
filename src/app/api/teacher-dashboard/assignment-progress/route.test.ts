import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const mockState = vi.hoisted(() => ({
  serverClient: null as SupabaseClient | null,
  adminClient: null as SupabaseClient | null,
  role: "teacher" as "student" | "teacher" | "admin" | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    if (!mockState.serverClient) {
      throw new Error("Test server client is not configured.");
    }
    return mockState.serverClient;
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (!mockState.adminClient) {
      throw new Error("Test admin client is not configured.");
    }
    return mockState.adminClient;
  }),
}));

vi.mock("@/lib/auth/server-role", () => ({
  resolveRoleWithServerFallback: vi.fn(async () => mockState.role),
}));

import { GET } from "@/app/api/teacher-dashboard/assignment-progress/route";

function makeUser(id: string): User {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-04-01T00:00:00.000Z",
  } as User;
}

describe("GET /api/teacher-dashboard/assignment-progress", () => {
  it("excludes users flagged with excluded_from_analytics from rows and summary counts", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: {
        profiles: {
          rows: [{ id: "teacher-1", role: "teacher" }],
        },
      },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "school-1", teacher_user_id: "teacher-1" }],
        },
        schools: { rows: [] },
        school_members: {
          rows: [
            { school_id: "school-1", student_user_id: "student-included" },
            { school_id: "school-1", student_user_id: "student-excluded" },
          ],
        },
        profiles: {
          rows: [
            {
              id: "student-included",
              display_name: "Included Student",
              student_id: "S-001",
              excluded_from_analytics: false,
            },
            {
              id: "student-excluded",
              display_name: "Excluded Student",
              student_id: "S-002",
              excluded_from_analytics: true,
            },
          ],
        },
        assignments: {
          rows: [
            {
              id: "as-1",
              title: "Assignment 1",
              school_id: "school-1",
              due_date: null,
              mode: "practice",
              max_questions: null,
              created_at: "2026-04-22T00:00:00.000Z",
            },
          ],
        },
        assignment_targets: {
          rows: [
            {
              assignment_id: "as-1",
              student_user_id: "student-included",
              last_completed_at: null,
            },
            {
              assignment_id: "as-1",
              student_user_id: "student-excluded",
              last_completed_at: "2026-04-21T00:00:00.000Z",
            },
          ],
        },
        attempts: {
          rows: [
            {
              user_id: "student-included",
              assignment_id: "as-1",
              question_id: "q-1",
            },
            {
              user_id: "student-excluded",
              assignment_id: "as-1",
              question_id: "q-1",
            },
          ],
        },
        assignment_question_snapshots: {
          rows: [{ assignment_id: "as-1" }],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "teacher";

    const response = await GET(
      new Request("http://localhost/api/teacher-dashboard/assignment-progress"),
    );
    const body = (await response.json()) as {
      assignments: Array<{
        assignmentId: string;
        totalTargets: number;
        completedCount: number;
        inProgressCount: number;
        notStartedCount: number;
      }>;
      rows: Array<{ studentId: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.studentId).toBe("student-included");

    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0]).toMatchObject({
      assignmentId: "as-1",
      totalTargets: 1,
      completedCount: 0,
      inProgressCount: 1,
      notStartedCount: 0,
    });
  });

  it("returns empty response when all scoped students are excluded", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: {
        profiles: {
          rows: [{ id: "teacher-1", role: "teacher" }],
        },
      },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "school-1", teacher_user_id: "teacher-1" }],
        },
        schools: { rows: [] },
        school_members: {
          rows: [{ school_id: "school-1", student_user_id: "student-excluded" }],
        },
        profiles: {
          rows: [
            {
              id: "student-excluded",
              display_name: "Excluded Student",
              student_id: "S-002",
              excluded_from_analytics: true,
            },
          ],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "teacher";

    const response = await GET(
      new Request(
        "http://localhost/api/teacher-dashboard/assignment-progress?studentId=student-excluded",
      ),
    );
    const body = (await response.json()) as {
      assignments: unknown[];
      rows: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ assignments: [], rows: [] });
  });
});
