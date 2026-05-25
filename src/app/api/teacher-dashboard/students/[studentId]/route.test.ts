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

import { GET } from "@/app/api/teacher-dashboard/students/[studentId]/route";

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

function params(studentId: string) {
  return { params: Promise.resolve({ studentId }) };
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

describe("GET /api/teacher-dashboard/students/[studentId]", () => {
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
      new Request("https://example.com/api/teacher-dashboard/students/s1"),
      params("s1"),
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
      new Request("https://example.com/api/teacher-dashboard/students/s1"),
      params("s1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 (not 404) when student is outside the teacher's scope", async () => {
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
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        "https://example.com/api/teacher-dashboard/students/stu_other?range=all",
      ),
      params("stu_other"),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns empty payload for an in-scope student with zero attempts", async () => {
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
        assignments: { rows: [] },
        generated_questions: { rows: [] },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        "https://example.com/api/teacher-dashboard/students/stu_mine?range=all",
      ),
      params("stu_mine"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(0);
    expect(body.summary.status).toBe("not_started");
    expect(body.chart).toEqual([]);
    expect(body.answers.rows).toEqual([]);
  });

  it("returns chart and answer list for an in-scope student", async () => {
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
        attempts: {
          rows: [
            {
              id: "att1",
              user_id: "stu_mine",
              question_id: "q1",
              mode: "practice",
              assignment_id: null,
              standard_id: "3.1.9-12.A",
              standard_label: "A",
              selected_option_id: "b",
              is_correct: true,
              time_spent_sec: 30,
              answered_at: "2026-05-22T08:00:00Z",
            },
            {
              id: "att2",
              user_id: "stu_mine",
              question_id: "q1",
              mode: "practice",
              assignment_id: "asg_1",
              standard_id: "3.1.9-12.A",
              standard_label: "A",
              selected_option_id: "a",
              is_correct: false,
              time_spent_sec: 50,
              answered_at: "2026-05-22T08:01:00Z",
            },
          ],
        },
        assignments: {
          rows: [{ id: "asg_1", title: "Cell Structure Quiz" }],
        },
        generated_questions: {
          rows: [
            { id: "q1", payload: validPayload, updated_at: "2026-04-01" },
          ],
        },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = server;
    mockState.adminClient = admin;
    const res = await GET(
      new Request(
        "https://example.com/api/teacher-dashboard/students/stu_mine?range=all",
      ),
      params("stu_mine"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(2);
    expect(body.summary.totalCorrect).toBe(1);
    expect(body.chart.length).toBe(2);
    expect(body.answers.rows.length).toBe(2);
    // Latest-first: att2 first.
    expect(body.answers.rows[0].attemptId).toBe("att2");
    expect(body.answers.rows[0].assignmentLabel).toBe("Cell Structure Quiz");
    expect(body.answers.rows[1].assignmentLabel).toBe("Self-practice");
    expect(body.filters.assignments).toEqual([
      { id: "asg_1", label: "Cell Structure Quiz" },
    ]);
    expect(body.filters.standards).toEqual([
      { id: "3.1.9-12.A", label: "A" },
    ]);
  });

  it("rejects invalid query (range)", async () => {
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
        "https://example.com/api/teacher-dashboard/students/stu_mine?range=99d",
      ),
      params("stu_mine"),
    );
    expect(res.status).toBe(400);
  });
});
