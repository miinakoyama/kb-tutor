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
    if (!mockState.serverClient) throw new Error("server client not configured");
    return mockState.serverClient;
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (!mockState.adminClient) throw new Error("admin client not configured");
    return mockState.adminClient;
  }),
}));
vi.mock("@/lib/auth/server-role", () => ({
  resolveRoleWithServerFallback: vi.fn(async () => mockState.role),
}));

import { GET } from "@/app/api/teacher-dashboard/standards/[standardId]/sample/route";

function makeUser(id: string): User {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-04-01T00:00:00.000Z",
  } as User;
}

function params(standardId: string) {
  return { params: Promise.resolve({ standardId }) };
}

const standardId = "3.1.9-12.A";

const defaultProfile = {
  profiles: { rows: [{ id: "teacher-1", role: "teacher" }] },
};

function bankPayload(id: string, accuracyTag = id) {
  return {
    text: `Stem ${id}`,
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correctOptionId: "b",
    standardId,
    _tag: accuracyTag,
  };
}

describe("GET /api/teacher-dashboard/standards/[standardId]/sample", () => {
  it("returns 401 when unauthenticated", async () => {
    mockState.role = "teacher";
    const { client: server } = createMockSupabaseClient({
      user: null,
      tables: defaultProfile,
    });
    const { client: admin } = createMockSupabaseClient({});
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${standardId}/sample`,
      ),
      params(standardId),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for student role", async () => {
    mockState.role = "student";
    const { client: server } = createMockSupabaseClient({
      user: makeUser("u"),
      tables: defaultProfile,
    });
    const { client: admin } = createMockSupabaseClient({});
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${standardId}/sample`,
      ),
      params(standardId),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown standardId", async () => {
    mockState.role = "teacher";
    const { client: server } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfile,
    });
    const { client: admin } = createMockSupabaseClient({});
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        "https://example.com/api/teacher-dashboard/standards/unknown-id/sample",
      ),
      params("unknown-id"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with questionId=null when the bank is empty", async () => {
    mockState.role = "teacher";
    const { client: server } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfile,
    });
    const { client: admin } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "sch_a", teacher_user_id: "teacher-1" }],
        },
        schools: {
          rows: [{ id: "sch_a", name: "North", teacher_user_id: null }],
        },
        school_members: {
          rows: [{ school_id: "sch_a", student_user_id: "stu_mine" }],
        },
        profiles: {
          rows: [
            {
              id: "stu_mine",
              display_name: "Mine",
              student_id: "M",
              excluded_from_analytics: false,
            },
          ],
        },
        generated_questions: { rows: [] },
        assignment_question_snapshots: { rows: [] },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${standardId}/sample?seed=abcd1234`,
      ),
      params(standardId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questionId).toBeNull();
    expect(body.totalAvailable).toBe(0);
    expect(body.isLast).toBe(true);
    expect(body.seed).toBe("abcd1234");
  });

  it("returns a question for high_accuracy_first based on in-scope stats", async () => {
    mockState.role = "teacher";
    const { client: server } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfile,
    });
    const { client: admin } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "sch_a", teacher_user_id: "teacher-1" }],
        },
        schools: {
          rows: [{ id: "sch_a", name: "North", teacher_user_id: null }],
        },
        school_members: {
          rows: [
            { school_id: "sch_a", student_user_id: "stu_1" },
            { school_id: "sch_a", student_user_id: "stu_2" },
          ],
        },
        profiles: {
          rows: [
            {
              id: "stu_1",
              display_name: "Alice",
              student_id: "S1",
              excluded_from_analytics: false,
            },
            {
              id: "stu_2",
              display_name: "Bob",
              student_id: "S2",
              excluded_from_analytics: false,
            },
          ],
        },
        generated_questions: {
          rows: [
            { id: "q_hi", payload: bankPayload("q_hi"), updated_at: "2026-04-01" },
            { id: "q_lo", payload: bankPayload("q_lo"), updated_at: "2026-04-01" },
          ],
        },
        assignment_question_snapshots: { rows: [] },
        attempts: {
          rows: [
            // q_hi: 2/2 = 1.0
            {
              user_id: "stu_1",
              question_id: "q_hi",
              mode: "practice",
              assignment_id: null,
              standard_id: standardId,
              is_correct: true,
              time_spent_sec: 30,
              answered_at: "2026-05-22T08:00:00Z",
              id: "a1",
            },
            {
              user_id: "stu_2",
              question_id: "q_hi",
              mode: "practice",
              assignment_id: null,
              standard_id: standardId,
              is_correct: true,
              time_spent_sec: 30,
              answered_at: "2026-05-22T08:01:00Z",
              id: "a2",
            },
            // q_lo: 0/2 = 0
            {
              user_id: "stu_1",
              question_id: "q_lo",
              mode: "practice",
              assignment_id: null,
              standard_id: standardId,
              is_correct: false,
              time_spent_sec: 30,
              answered_at: "2026-05-22T08:02:00Z",
              id: "a3",
            },
            {
              user_id: "stu_2",
              question_id: "q_lo",
              mode: "practice",
              assignment_id: null,
              standard_id: standardId,
              is_correct: false,
              time_spent_sec: 30,
              answered_at: "2026-05-22T08:03:00Z",
              id: "a4",
            },
          ],
        },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${standardId}/sample?sampleMode=high_accuracy_first&seed=fixed`,
      ),
      params(standardId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalAvailable).toBe(2);
    expect(body.questionId).toBe("q_hi");
    expect(body.isLast).toBe(false);
  });

  it("returns deterministic random ordering with the same seed across calls", async () => {
    mockState.role = "teacher";
    const { client: server } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfile,
    });
    const { client: admin } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "sch_a", teacher_user_id: "teacher-1" }],
        },
        schools: {
          rows: [{ id: "sch_a", name: "North", teacher_user_id: null }],
        },
        school_members: {
          rows: [{ school_id: "sch_a", student_user_id: "stu_1" }],
        },
        profiles: {
          rows: [
            {
              id: "stu_1",
              display_name: "S1",
              student_id: "S1",
              excluded_from_analytics: false,
            },
          ],
        },
        generated_questions: {
          rows: [
            { id: "qa", payload: bankPayload("qa"), updated_at: "2026-04-01" },
            { id: "qb", payload: bankPayload("qb"), updated_at: "2026-04-01" },
            { id: "qc", payload: bankPayload("qc"), updated_at: "2026-04-01" },
          ],
        },
        assignment_question_snapshots: { rows: [] },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;

    const out0 = await (
      await GET(
        new Request(
          `https://example.com/api/teacher-dashboard/standards/${standardId}/sample?sampleMode=random&seed=fixed&skip=0`,
        ),
        params(standardId),
      )
    ).json();
    const out1 = await (
      await GET(
        new Request(
          `https://example.com/api/teacher-dashboard/standards/${standardId}/sample?sampleMode=random&seed=fixed&skip=0`,
        ),
        params(standardId),
      )
    ).json();
    expect(out0.questionId).toBe(out1.questionId);
  });
});
