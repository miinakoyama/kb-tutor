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

import { GET } from "@/app/api/teacher/question-sets/route";

function makeUser(id: string): User {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-05-01T00:00:00.000Z",
  } as User;
}

describe("GET /api/teacher/question-sets", () => {
  it("returns school-linked sets with creator metadata", async () => {
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
        schools: {
          rows: [{ id: "school-1", name: "Demo High School", teacher_user_id: null }],
        },
        school_question_sets: {
          rows: [{ school_id: "school-1", set_id: "set-1" }],
        },
        generated_question_sets: {
          rows: [
            {
              id: "set-1",
              name: "Shared Set",
              user_id: "teacher-2",
              generated_at: "2026-05-02T12:00:00.000Z",
              generation_model_id: "gemini",
              generation_model_label: "AI Generated",
            },
          ],
        },
        profiles: {
          rows: [
            {
              id: "teacher-2",
              display_name: "Shared Teacher",
              email: "shared@example.com",
            },
          ],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "teacher";

    const response = await GET(
      new Request("http://localhost/api/teacher/question-sets?schoolId=school-1"),
    );
    const body = (await response.json()) as {
      rows: Array<{
        setId: string;
        creatorName: string;
        ownedByRequester: boolean;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.rows).toEqual([
      expect.objectContaining({
        setId: "set-1",
        creatorName: "Shared Teacher",
        ownedByRequester: false,
      }),
    ]);
  });

  it("returns 403 when the requester does not manage the school", async () => {
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
        school_teachers: { rows: [] },
        schools: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "teacher";

    const response = await GET(
      new Request("http://localhost/api/teacher/question-sets?schoolId=school-1"),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("You do not have access to this school.");
  });
});
