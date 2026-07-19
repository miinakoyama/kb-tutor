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

import { GET } from "@/app/api/teacher/schools/route";

function makeUser(id: string): User {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-07-01T00:00:00.000Z",
  } as User;
}

function configureTeacherAccess() {
  const { client } = createMockSupabaseClient({
    user: makeUser("teacher-1"),
    tables: {
      profiles: { rows: [{ id: "teacher-1", role: "teacher" }] },
    },
  });
  mockState.serverClient = client;
  mockState.role = "teacher";
}

describe("GET /api/teacher/schools", () => {
  it("returns the teacher's single assigned school", async () => {
    configureTeacherAccess();
    const { client } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "school-a", teacher_user_id: "teacher-1" }],
        },
        schools: {
          rows: [
            {
              id: "school-a",
              name: "School A",
              teacher_user_id: "teacher-1",
              created_at: "2026-07-01T00:00:00.000Z",
            },
          ],
        },
        school_members: {
          rows: [
            { school_id: "school-a", student_user_id: "student-1" },
            { school_id: "school-a", student_user_id: "student-2" },
          ],
        },
      },
    });
    mockState.adminClient = client;

    const response = await GET();
    const body = (await response.json()) as {
      schools: Array<{ id: string; member_count: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.schools).toEqual([
      expect.objectContaining({ id: "school-a", member_count: 2 }),
    ]);
  });

  it("returns a configuration error instead of choosing the first school", async () => {
    configureTeacherAccess();
    const { client } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [
            { school_id: "school-a", teacher_user_id: "teacher-1" },
            { school_id: "school-b", teacher_user_id: "teacher-1" },
          ],
        },
      },
    });
    mockState.adminClient = client;

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("Teacher account is assigned to multiple schools.");
  });
});

