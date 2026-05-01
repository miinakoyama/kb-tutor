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

import { GET } from "@/app/api/assignments/manage/route";

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

describe("GET /api/assignments/manage", () => {
  it("allows a teacher to load questions for a school-linked set created by someone else", async () => {
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
        generated_question_sets: {
          rows: [],
        },
        school_question_sets: {
          rows: [
            {
              school_id: "school-1",
              set_id: "set-1",
              generated_question_sets: {
                id: "set-1",
                name: "Shared Set",
                user_id: "teacher-2",
                generated_at: "2026-05-02T10:00:00.000Z",
              },
            },
          ],
        },
        generated_questions: {
          rows: [
            {
              id: "q-1",
              set_id: "set-1",
              payload: {
                id: "q-1",
                module: 1,
                topic: "Genetics",
                text: "What carries genetic information?",
                imageUrl: null,
                options: [
                  { id: "A", text: "DNA" },
                  { id: "B", text: "Lipids" },
                ],
                correctOptionId: "A",
                source: "manual",
              },
              created_at: "2026-05-02T10:00:00.000Z",
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
        "http://localhost/api/assignments/manage?questionsForSetId=set-1",
      ) as never,
    );
    const body = (await response.json()) as {
      questions: Array<{ questionId: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.questions).toEqual([{ questionId: "q-1", payload: expect.any(Object) }]);
  });

  it("includes school-linked sets in the assignment creation payload for teachers", async () => {
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
        assignments: { rows: [] },
        school_members: { rows: [] },
        generated_question_sets: {
          rows: [
            {
              id: "owned-set",
              name: "Owned Set",
              user_id: "teacher-1",
              generated_at: "2026-05-01T09:00:00.000Z",
            },
          ],
        },
        school_question_sets: {
          rows: [
            {
              school_id: "school-1",
              set_id: "shared-set",
              generated_question_sets: {
                id: "shared-set",
                name: "Shared Set",
                user_id: "teacher-2",
                generated_at: "2026-05-02T10:00:00.000Z",
              },
            },
          ],
        },
        generated_questions: {
          rows: [
            { set_id: "owned-set" },
            { set_id: "shared-set" },
          ],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "teacher";

    const response = await GET(
      new Request("http://localhost/api/assignments/manage") as never,
    );
    const body = (await response.json()) as {
      question_sets: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.question_sets.map((set) => set.id)).toEqual([
      "shared-set",
      "owned-set",
    ]);
  });
});
