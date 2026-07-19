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

import { PATCH, POST } from "@/app/api/admin/schools/route";

function makeUser(id: string = "admin-1"): User {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-04-01T00:00:00.000Z",
  } as User;
}

function configureAdminAccess() {
  const { client: serverClient } = createMockSupabaseClient({
    user: makeUser(),
    tables: { profiles: { rows: [{ id: "admin-1", role: "admin" }] } },
  });
  mockState.serverClient = serverClient;
}

function makeRequest(method: "POST" | "PATCH", body: unknown) {
  return new Request("http://localhost/api/admin/schools", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/schools - studentLoginNotice", () => {
  it("rejects teacher assignment because it is managed from Accounts", async () => {
    configureAdminAccess();
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: { schools: { rows: [] } },
    });
    mockState.adminClient = adminClient;

    const response = await POST(
      makeRequest("POST", {
        id: "sch_teacher_assignment",
        name: "Northfield High",
        teacherUserIds: ["teacher-1"],
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Manage teacher school assignments from Account Management.",
    );
    expect(tables.schools.rows).toHaveLength(0);
  });

  it("stores trimmed studentLoginNotice for valid input", async () => {
    configureAdminAccess();
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: { schools: { rows: [] } },
    });
    mockState.adminClient = adminClient;

    const response = await POST(
      makeRequest("POST", {
        id: "sch_1",
        name: "Northfield High",
        studentLoginNotice: "  Please use your school email if needed.  ",
      }),
    );
    const body = (await response.json()) as { ok: boolean; id: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, id: "sch_1" });
    expect(tables.schools.rows).toHaveLength(1);
    expect(tables.schools.rows[0]?.student_login_notice).toBe(
      "Please use your school email if needed.",
    );
  });

  it.each([null, "", "   "])(
    "normalizes studentLoginNotice=%j to null",
    async (studentLoginNotice) => {
      configureAdminAccess();
      const { client: adminClient, tables } = createMockSupabaseClient({
        tables: { schools: { rows: [] } },
      });
      mockState.adminClient = adminClient;

      const response = await POST(
        makeRequest("POST", {
          id: "sch_2",
          name: "Eastside Academy",
          studentLoginNotice,
        }),
      );

      expect(response.status).toBe(200);
      expect(tables.schools.rows).toHaveLength(1);
      expect(tables.schools.rows[0]?.student_login_notice).toBeNull();
    },
  );

  it("returns 400 when studentLoginNotice exceeds the max length", async () => {
    configureAdminAccess();
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: { schools: { rows: [] } },
    });
    mockState.adminClient = adminClient;

    const response = await POST(
      makeRequest("POST", {
        id: "sch_3",
        name: "Westview School",
        studentLoginNotice: "a".repeat(2001),
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("studentLoginNotice must be 2000 characters or less");
    expect(tables.schools.rows).toHaveLength(0);
  });

  it("returns 400 when studentLoginNotice has an invalid type", async () => {
    configureAdminAccess();
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: { schools: { rows: [] } },
    });
    mockState.adminClient = adminClient;

    const response = await POST(
      makeRequest("POST", {
        id: "sch_4",
        name: "Riverside School",
        studentLoginNotice: 1234,
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("studentLoginNotice must be a string or null");
    expect(tables.schools.rows).toHaveLength(0);
  });
});

describe("PATCH /api/admin/schools - studentLoginNotice", () => {
  it("stores trimmed studentLoginNotice for valid input", async () => {
    configureAdminAccess();
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        schools: {
          rows: [
            { id: "sch_patch_1", name: "Before", student_login_notice: "Old value" },
          ],
        },
      },
    });
    mockState.adminClient = adminClient;

    const response = await PATCH(
      makeRequest("PATCH", {
        id: "sch_patch_1",
        studentLoginNotice: "  New notice for students.  ",
      }),
    );

    expect(response.status).toBe(200);
    expect(tables.schools.rows[0]?.student_login_notice).toBe(
      "New notice for students.",
    );
  });

  it.each([null, "", "   "])(
    "normalizes PATCH studentLoginNotice=%j to null",
    async (studentLoginNotice) => {
      configureAdminAccess();
      const { client: adminClient, tables } = createMockSupabaseClient({
        tables: {
          schools: {
            rows: [
              {
                id: "sch_patch_2",
                name: "Before",
                student_login_notice: "Should be removed",
              },
            ],
          },
        },
      });
      mockState.adminClient = adminClient;

      const response = await PATCH(
        makeRequest("PATCH", {
          id: "sch_patch_2",
          studentLoginNotice,
        }),
      );

      expect(response.status).toBe(200);
      expect(tables.schools.rows[0]?.student_login_notice).toBeNull();
    },
  );

  it("returns 400 when PATCH studentLoginNotice exceeds the max length", async () => {
    configureAdminAccess();
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        schools: {
          rows: [
            {
              id: "sch_patch_3",
              name: "Before",
              student_login_notice: "Unchanged",
            },
          ],
        },
      },
    });
    mockState.adminClient = adminClient;

    const response = await PATCH(
      makeRequest("PATCH", {
        id: "sch_patch_3",
        studentLoginNotice: "b".repeat(2001),
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("studentLoginNotice must be 2000 characters or less");
    expect(tables.schools.rows[0]?.student_login_notice).toBe("Unchanged");
  });

  it("returns 400 when PATCH studentLoginNotice has an invalid type", async () => {
    configureAdminAccess();
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        schools: {
          rows: [
            {
              id: "sch_patch_4",
              name: "Before",
              student_login_notice: "Unchanged",
            },
          ],
        },
      },
    });
    mockState.adminClient = adminClient;

    const response = await PATCH(
      makeRequest("PATCH", {
        id: "sch_patch_4",
        studentLoginNotice: { text: "not allowed" },
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("studentLoginNotice must be a string or null");
    expect(tables.schools.rows[0]?.student_login_notice).toBe("Unchanged");
  });
});
