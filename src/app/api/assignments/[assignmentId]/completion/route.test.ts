import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
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

import { POST } from "@/app/api/assignments/[assignmentId]/completion/route";

function makeUser(id: string = "student-1"): User {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-04-01T00:00:00.000Z",
  } as User;
}

function contextFor(assignmentId: string) {
  return { params: Promise.resolve({ assignmentId }) };
}

function requestMock(): NextRequest {
  return new Request("http://localhost/api/assignments/as_1/completion") as unknown as NextRequest;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/assignments/[assignmentId]/completion", () => {
  it("returns 401 when unauthenticated", async () => {
    const { client: serverClient } = createMockSupabaseClient({ user: null });
    const { client: adminClient } = createMockSupabaseClient();
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when assignment does not exist", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(requestMock(), contextFor("as_missing"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("Assignment not found");
  });

  it("returns 403 when student is neither targeted nor a school member", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{ id: "as_1", school_id: "school-1", created_at: "2026-04-01T00:00:00.000Z" }],
        },
        assignment_targets: { rows: [] },
        school_members: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("creates assignment_targets row for late-joined students", async () => {
    vi.setSystemTime(new Date("2026-04-22T14:00:00.000Z"));
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{ id: "as_1", school_id: "school-1", created_at: "2026-04-01T09:00:00.000Z" }],
        },
        assignment_targets: { rows: [] },
        school_members: {
          rows: [{ school_id: "school-1", student_user_id: "student-1" }],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { ok: boolean; last_completed_at: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.last_completed_at).toBe("2026-04-22T14:00:00.000Z");
    expect(tables.assignment_targets.rows).toEqual([
      {
        assignment_id: "as_1",
        student_user_id: "student-1",
        created_at: "2026-04-01T09:00:00.000Z",
        last_completed_at: "2026-04-22T14:00:00.000Z",
      },
    ]);
  });

  it("updates last_completed_at when target row already exists", async () => {
    vi.setSystemTime(new Date("2026-04-22T15:00:00.000Z"));
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{ id: "as_1", school_id: "school-1", created_at: "2026-04-01T09:00:00.000Z" }],
        },
        assignment_targets: {
          rows: [
            {
              assignment_id: "as_1",
              student_user_id: "student-1",
              created_at: "2026-04-01T09:00:00.000Z",
              last_completed_at: null,
            },
          ],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { ok: boolean; last_completed_at: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.last_completed_at).toBe("2026-04-22T15:00:00.000Z");
    expect(tables.assignment_targets.rows[0].last_completed_at).toBe(
      "2026-04-22T15:00:00.000Z",
    );
  });

  it("returns 500 when assignment.created_at is missing during backfill insert", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{ id: "as_1", school_id: "school-1", created_at: null }],
        },
        assignment_targets: { rows: [] },
        school_members: {
          rows: [{ school_id: "school-1", student_user_id: "student-1" }],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("Assignment is missing created_at");
  });
});
