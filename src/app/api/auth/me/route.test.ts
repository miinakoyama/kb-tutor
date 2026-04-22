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

import { GET } from "@/app/api/auth/me/route";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "u1@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  } as User;
}

describe("GET /api/auth/me", () => {
  it("returns null user/profile when unauthenticated", async () => {
    const { client: serverClient } = createMockSupabaseClient({ user: null });
    const { client: adminClient } = createMockSupabaseClient();
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await GET();
    const body = (await response.json()) as {
      user: unknown;
      profile: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.user).toBeNull();
    expect(body.profile).toBeNull();
  });

  it("prefers the session profile when it has a valid role", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
      tables: {
        profiles: {
          rows: [
            {
              id: "user-1",
              email: "u1@example.com",
              student_id: "S-1",
              display_name: "Session User",
              role: "teacher",
            },
          ],
        },
      },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: { profiles: { rows: [] } },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await GET();
    const body = (await response.json()) as {
      profile: { display_name: string; role: string };
    };

    expect(response.status).toBe(200);
    expect(body.profile.display_name).toBe("Session User");
    expect(body.profile.role).toBe("teacher");
  });

  it("falls back to admin profile when session profile role is invalid", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
      tables: {
        profiles: {
          rows: [
            {
              id: "user-1",
              email: "u1@example.com",
              student_id: "S-1",
              display_name: "Session User",
              role: "unknown",
            },
          ],
        },
      },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        profiles: {
          rows: [
            {
              id: "user-1",
              email: "u1@example.com",
              student_id: "S-1",
              display_name: "Admin User",
              role: "admin",
            },
          ],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await GET();
    const body = (await response.json()) as {
      profile: { display_name: string; role: string };
    };

    expect(response.status).toBe(200);
    expect(body.profile.display_name).toBe("Admin User");
    expect(body.profile.role).toBe("admin");
  });

  it("self-heals missing profile rows with metadata-based fallback role", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser({
        user_metadata: { role: "student", display_name: "Meta User" },
      }),
      tables: {
        profiles: { rows: [] },
      },
    });
    const { client: adminClient, tables: adminTables } = createMockSupabaseClient({
      tables: {
        profiles: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await GET();
    const body = (await response.json()) as {
      profile: { id: string; role: string; display_name: string | null };
    };

    expect(response.status).toBe(200);
    expect(body.profile.id).toBe("user-1");
    expect(body.profile.role).toBe("student");
    expect(body.profile.display_name).toBe("Meta User");
    expect(adminTables.profiles.rows).toEqual([
      {
        id: "user-1",
        email: "u1@example.com",
        student_id: null,
        display_name: "Meta User",
        role: "student",
      },
    ]);
  });

  it("returns fallback profile when upsert fails", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser({
        app_metadata: { role: "teacher" },
      }),
      tables: {
        profiles: { rows: [] },
      },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        profiles: {
          rows: [],
          error: { message: "write failed" },
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await GET();
    const body = (await response.json()) as {
      profile: { id: string; role: string };
    };

    expect(response.status).toBe(200);
    expect(body.profile.id).toBe("user-1");
    expect(body.profile.role).toBe("teacher");
  });
});
