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

import { GET } from "@/app/api/teacher-dashboard/questions/[questionId]/route";

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

function params(questionId: string) {
  return { params: Promise.resolve({ questionId }) };
}

const validPayload = {
  text: "Sample question",
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  correctOptionId: "b",
};

const defaultProfile = {
  profiles: { rows: [{ id: "teacher-1", role: "teacher" }] },
};

describe("GET /api/teacher-dashboard/questions/[questionId]", () => {
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
      new Request("https://example.com/api/teacher-dashboard/questions/q1"),
      params("q1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is student", async () => {
    mockState.role = "student";
    const { client: server } = createMockSupabaseClient({
      user: makeUser("u"),
      tables: defaultProfile,
    });
    const { client: admin } = createMockSupabaseClient({});
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request("https://example.com/api/teacher-dashboard/questions/q1"),
      params("q1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when the question has no preview and no attempts", async () => {
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
        attempts: { rows: [] },
        generated_questions: { rows: [] },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        "https://example.com/api/teacher-dashboard/questions/q_unknown?range=all",
      ),
      params("q_unknown"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with empty stats when question is in bank but no in-scope attempts", async () => {
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
        attempts: { rows: [] },
        generated_questions: {
          rows: [{ id: "q1", payload: validPayload, updated_at: "2026-04-01" }],
        },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        "https://example.com/api/teacher-dashboard/questions/q1?range=all",
      ),
      params("q1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(0);
    expect(body.optionDistribution).toHaveLength(2);
    expect(body.optionDistribution[0].picks).toBe(0);
    expect(body.studentContext).toBeUndefined();
  });

  it("returns aggregates + studentContext for an in-scope student", async () => {
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
        attempts: {
          rows: [
            {
              user_id: "stu_1",
              question_id: "q1",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "b",
              is_correct: true,
              time_spent_sec: 30,
              standard_id: "3.1.9-12.A",
              standard_label: "Standard A",
              answered_at: "2026-05-22T08:00:00Z",
              id: "att1",
            },
            {
              user_id: "stu_2",
              question_id: "q1",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "a",
              is_correct: false,
              time_spent_sec: 50,
              standard_id: "3.1.9-12.A",
              standard_label: "Standard A",
              answered_at: "2026-05-22T08:01:00Z",
              id: "att2",
            },
          ],
        },
        generated_questions: {
          rows: [{ id: "q1", payload: validPayload, updated_at: "2026-04-01" }],
        },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        "https://example.com/api/teacher-dashboard/questions/q1?range=all&studentId=stu_1",
      ),
      params("q1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(2);
    expect(body.summary.correct).toBe(1);
    expect(body.studentContext).toBeDefined();
    expect(body.studentContext.studentId).toBe("stu_1");
    expect(body.studentContext.isCorrect).toBe(true);
    expect(body.standardId).toBe("3.1.9-12.A");
  });

  it("omits studentContext when studentId is outside the teacher's scope (no leak)", async () => {
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
              display_name: "Alice",
              student_id: "S1",
              excluded_from_analytics: false,
            },
          ],
        },
        attempts: {
          rows: [
            {
              user_id: "stu_1",
              question_id: "q1",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "b",
              is_correct: true,
              time_spent_sec: 30,
              standard_id: "3.1.9-12.A",
              standard_label: "Standard A",
              answered_at: "2026-05-22T08:00:00Z",
              id: "att1",
            },
          ],
        },
        generated_questions: {
          rows: [{ id: "q1", payload: validPayload, updated_at: "2026-04-01" }],
        },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        "https://example.com/api/teacher-dashboard/questions/q1?range=all&studentId=stu_other",
      ),
      params("q1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(1);
    expect(body.studentContext).toBeUndefined();
  });
});
