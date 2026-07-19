import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const mockState = vi.hoisted(() => ({
  serverClient: null as SupabaseClient | null,
  adminClient: null as SupabaseClient | null,
  role: "admin" as "student" | "teacher" | "admin" | null,
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

import { PATCH } from "@/app/api/admin/users/route";

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

function configureAdminAccess() {
  const { client } = createMockSupabaseClient({
    user: makeUser("admin-1"),
    tables: { profiles: { rows: [{ id: "admin-1", role: "admin" }] } },
  });
  mockState.serverClient = client;
  mockState.role = "admin";
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/users - teacher school assignment", () => {
  it("moves a teacher through the transactional assignment RPC", async () => {
    configureAdminAccess();
    const assignmentRpc = vi.fn(async () => ({ data: null, error: null }));
    const { client } = createMockSupabaseClient({
      tables: {
        profiles: { rows: [{ id: "teacher-1", role: "teacher" }] },
        schools: { rows: [{ id: "school-b" }] },
      },
      rpcs: { set_teacher_school_assignment: assignmentRpc },
    });
    mockState.adminClient = client;

    const response = await PATCH(
      makeRequest({ id: "teacher-1", schoolId: "school-b" }),
    );

    expect(response.status).toBe(200);
    expect(assignmentRpc).toHaveBeenCalledWith({
      p_teacher_user_id: "teacher-1",
      p_school_id: "school-b",
    });
  });

  it("allows a teacher to become unassigned", async () => {
    configureAdminAccess();
    const assignmentRpc = vi.fn(async () => ({ data: null, error: null }));
    const { client } = createMockSupabaseClient({
      tables: {
        profiles: { rows: [{ id: "teacher-1", role: "teacher" }] },
      },
      rpcs: { set_teacher_school_assignment: assignmentRpc },
    });
    mockState.adminClient = client;

    const response = await PATCH(
      makeRequest({ id: "teacher-1", schoolId: null }),
    );

    expect(response.status).toBe(200);
    expect(assignmentRpc).toHaveBeenCalledWith({
      p_teacher_user_id: "teacher-1",
      p_school_id: null,
    });
  });

  it("rejects school assignment for a non-teacher account", async () => {
    configureAdminAccess();
    const assignmentRpc = vi.fn(async () => ({ data: null, error: null }));
    const { client } = createMockSupabaseClient({
      tables: {
        profiles: { rows: [{ id: "student-1", role: "student" }] },
      },
      rpcs: { set_teacher_school_assignment: assignmentRpc },
    });
    mockState.adminClient = client;

    const response = await PATCH(
      makeRequest({ id: "student-1", schoolId: "school-a" }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Only teacher accounts can be assigned to a school");
    expect(assignmentRpc).not.toHaveBeenCalled();
  });
});
