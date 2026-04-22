import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const mockState = vi.hoisted(() => ({
  serverClient: null as SupabaseClient | null,
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockState.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    if (!mockState.serverClient) {
      throw new Error("Test server client is not configured.");
    }
    return mockState.serverClient;
  }),
}));

import { POST } from "@/app/api/notifications/mark-read/route";

beforeEach(() => {
  vi.useFakeTimers();
  mockState.revalidatePath.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/notifications/mark-read", () => {
  it("returns 401 when the user is not authenticated", async () => {
    const { client } = createMockSupabaseClient({ user: null });
    mockState.serverClient = client;

    const response = await POST();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 500 when persisting the read timestamp fails", async () => {
    const { client } = createMockSupabaseClient({
      user: { id: "student-1" } as User,
      tables: {
        user_settings: {
          rows: [],
          error: { message: "db write failed" },
        },
      },
    });
    mockState.serverClient = client;

    const response = await POST();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("db write failed");
    expect(mockState.revalidatePath).not.toHaveBeenCalled();
  });

  it("stores notifications_last_read_at and revalidates related pages", async () => {
    vi.setSystemTime(new Date("2026-04-22T10:30:00.000Z"));
    const { client, tables } = createMockSupabaseClient({
      user: { id: "student-1" } as User,
      tables: {
        user_settings: { rows: [] },
      },
    });
    mockState.serverClient = client;

    const response = await POST();
    const body = (await response.json()) as {
      ok: boolean;
      notifications_last_read_at: string;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.notifications_last_read_at).toBe("2026-04-22T10:30:00.000Z");
    expect(tables.user_settings.rows).toEqual([
      {
        user_id: "student-1",
        notifications_last_read_at: "2026-04-22T10:30:00.000Z",
      },
    ]);
    expect(mockState.revalidatePath).toHaveBeenCalledWith("/");
    expect(mockState.revalidatePath).toHaveBeenCalledWith("/notifications");
  });

  it("remains idempotent under many concurrent mark-read requests", async () => {
    vi.setSystemTime(new Date("2026-04-22T11:00:00.000Z"));
    const { client, tables } = createMockSupabaseClient({
      user: { id: "student-1" } as User,
      tables: {
        user_settings: { rows: [] },
      },
    });
    mockState.serverClient = client;

    const responses = await Promise.all(
      Array.from({ length: 110 }, () => POST()),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(tables.user_settings.rows).toHaveLength(1);
    expect(tables.user_settings.rows[0]).toEqual({
      user_id: "student-1",
      notifications_last_read_at: "2026-04-22T11:00:00.000Z",
    });
  });
});
