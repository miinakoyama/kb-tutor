import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const mockState = vi.hoisted(() => ({
  serverClient: null as SupabaseClient | null,
  adminClient: null as SupabaseClient | null,
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

import { POST } from "@/app/api/analytics/attempts/route";

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

function attemptRequest(assignmentId: string) {
  return new Request("http://localhost/api/analytics/attempts", {
    method: "POST",
    body: JSON.stringify({
      clientAttemptId: "00000000-0000-4000-8000-000000000001",
      questionId: "q1",
      selectedOptionId: "A",
      isCorrect: true,
      mode: "practice",
      assignmentId,
      answeredAt: "2026-05-01T10:00:00.000Z",
    }),
  });
}

describe("POST /api/analytics/attempts", () => {
  it("does not trust an assignmentId when the student is outside its scope", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-outside"),
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{ id: "assignment-1", school_id: "school-1" }],
        },
        assignment_targets: { rows: [] },
        school_members: { rows: [] },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("assignment-1"));

    expect(response.status).toBe(200);
    expect(tables.attempts.rows).toHaveLength(1);
    expect(tables.attempts.rows[0].assignment_id).toBeNull();
  });

  it("keeps assignmentId when the student is a current school member", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{ id: "assignment-1", school_id: "school-1" }],
        },
        assignment_targets: { rows: [] },
        school_members: {
          rows: [{ school_id: "school-1", student_user_id: "student-1" }],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("assignment-1"));

    expect(response.status).toBe(200);
    expect(tables.attempts.rows).toHaveLength(1);
    expect(tables.attempts.rows[0].assignment_id).toBe("assignment-1");
  });
});
