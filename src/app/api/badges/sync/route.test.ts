import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const state = vi.hoisted(() => ({
  server: null as SupabaseClient | null,
  admin: null as SupabaseClient | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    if (!state.server) throw new Error("Missing test server");
    return state.server;
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (!state.admin) throw new Error("Missing test admin");
    return state.admin;
  }),
}));

import { POST } from "./route";

const USER = {
  id: "student-1",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01",
};

describe("POST /api/badges/sync", () => {
  it("requires authentication", async () => {
    state.server = createMockSupabaseClient({ user: null }).client;
    state.admin = createMockSupabaseClient().client;

    const response = await POST();

    expect(response.status).toBe(401);
  });

  it("returns and persists badges newly earned since the last sync", async () => {
    const mockServer = createMockSupabaseClient({
      user: USER,
      tables: {
        attempts: {
          rows: [
            {
              user_id: "student-1",
              mode: "practice",
              assignment_id: null,
              is_finalized: true,
              question_completed: true,
              answered_at: "2020-01-01T10:00:00.000Z",
            },
          ],
        },
        student_badges: { rows: [] },
      },
    });
    const mockAdmin = createMockSupabaseClient({
      tables: {
        student_kc_mastery: { rows: [] },
        student_badges: { rows: [] },
      },
    });
    state.server = mockServer.client;
    state.admin = mockAdmin.client;

    const response = await POST();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      newlyEarned: Array<{ id: string; name: string; icon: string }>;
    };
    expect(body.newlyEarned.map((b) => b.id)).toContain("first_practice");
    expect(mockServer.tables.student_badges.rows).toEqual([]);
    expect(mockAdmin.tables.student_badges.rows).toContainEqual(
      expect.objectContaining({ user_id: "student-1", badge_id: "first_practice" }),
    );
  });

  it("returns no newly earned badges once already persisted", async () => {
    const mockServer = createMockSupabaseClient({
      user: USER,
      tables: {
        attempts: {
          rows: [
            {
              user_id: "student-1",
              mode: "practice",
              assignment_id: null,
              is_finalized: true,
              question_completed: true,
              answered_at: "2020-01-01T10:00:00.000Z",
            },
          ],
        },
        student_badges: {
          rows: [{ user_id: "student-1", badge_id: "first_practice", earned_at: "2020-01-01T10:00:00.000Z" }],
        },
      },
    });
    state.server = mockServer.client;
    state.admin = createMockSupabaseClient({
      tables: { student_kc_mastery: { rows: [] } },
    }).client;

    const response = await POST();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { newlyEarned: unknown[] };
    expect(body.newlyEarned).toEqual([]);
  });

  it("does not award exam badges for draft multiple-choice attempts", async () => {
    const mockServer = createMockSupabaseClient({
      user: USER,
      tables: {
        attempts: {
          rows: [
            {
              user_id: "student-1",
              mode: "exam",
              assignment_id: "assignment-1",
              is_finalized: false,
              question_completed: false,
              answered_at: "2026-07-16T10:00:00.000Z",
            },
          ],
        },
        short_answer_attempts: { rows: [] },
        student_badges: { rows: [] },
      },
    });
    state.server = mockServer.client;
    state.admin = createMockSupabaseClient({
      tables: { student_kc_mastery: { rows: [] } },
    }).client;

    const response = await POST();
    const body = (await response.json()) as {
      newlyEarned: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.newlyEarned.map((badge) => badge.id)).not.toContain("first_exam");
    expect(mockServer.tables.student_badges.rows).toEqual([]);
  });

  it("awards activity badges from a completed short-answer summary", async () => {
    const mockServer = createMockSupabaseClient({
      user: USER,
      tables: {
        attempts: {
          rows: [
            {
              user_id: "student-1",
              mode: "review",
              assignment_id: null,
              selected_option_id: "short-answer",
              is_finalized: true,
              question_completed: true,
              answered_at: "2026-07-16T10:00:00.000Z",
            },
          ],
        },
        student_badges: { rows: [] },
      },
    });
    const mockAdmin = createMockSupabaseClient({
      tables: {
        student_kc_mastery: { rows: [] },
        student_badges: { rows: [] },
      },
    });
    state.server = mockServer.client;
    state.admin = mockAdmin.client;

    const response = await POST();
    const body = (await response.json()) as {
      newlyEarned: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.newlyEarned.map((badge) => badge.id)).toContain("first_review");
    expect(mockServer.tables.student_badges.rows).toEqual([]);
    expect(mockAdmin.tables.student_badges.rows).toContainEqual(
      expect.objectContaining({ user_id: "student-1", badge_id: "first_review" }),
    );
  });

  it("does not award activity badges for unresolved short-answer parts", async () => {
    const mockServer = createMockSupabaseClient({
      user: USER,
      tables: {
        attempts: { rows: [] },
        short_answer_attempts: {
          rows: [
            {
              user_id: "student-1",
              mode: "practice",
              assignment_id: null,
              part_label: "A",
              attempt_number: 1,
              is_correct: false,
              answered_at: "2026-07-16T10:00:00.000Z",
            },
          ],
        },
        student_badges: { rows: [] },
      },
    });
    const mockAdmin = createMockSupabaseClient({
      tables: {
        student_kc_mastery: { rows: [] },
        student_badges: { rows: [] },
      },
    });
    state.server = mockServer.client;
    state.admin = mockAdmin.client;

    const response = await POST();
    const body = (await response.json()) as {
      newlyEarned: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.newlyEarned).toEqual([]);
    expect(mockAdmin.tables.student_badges.rows).toEqual([]);
  });

  it("does not award activity badges for incomplete multiple-choice work", async () => {
    const mockServer = createMockSupabaseClient({
      user: USER,
      tables: {
        attempts: {
          rows: [
            {
              user_id: "student-1",
              mode: "practice",
              assignment_id: null,
              is_finalized: true,
              question_completed: false,
              answered_at: "2026-07-16T10:00:00.000Z",
            },
          ],
        },
        student_badges: { rows: [] },
      },
    });
    const mockAdmin = createMockSupabaseClient({
      tables: {
        student_kc_mastery: { rows: [] },
        student_badges: { rows: [] },
      },
    });
    state.server = mockServer.client;
    state.admin = mockAdmin.client;

    const response = await POST();
    const body = (await response.json()) as {
      newlyEarned: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.newlyEarned).toEqual([]);
    expect(mockAdmin.tables.student_badges.rows).toEqual([]);
  });
});
