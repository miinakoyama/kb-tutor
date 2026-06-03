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
    if (!mockState.serverClient) {
      throw new Error("server client not configured");
    }
    return mockState.serverClient;
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (!mockState.adminClient) {
      throw new Error("admin client not configured");
    }
    return mockState.adminClient;
  }),
}));

vi.mock("@/lib/auth/server-role", () => ({
  resolveRoleWithServerFallback: vi.fn(async () => mockState.role),
}));

import { GET } from "@/app/api/teacher-dashboard/standards/[standardId]/route";

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

function buildParams(standardId: string): {
  params: Promise<{ standardId: string }>;
} {
  return { params: Promise.resolve({ standardId }) };
}

const validStandard = "3.1.9-12.A";

const validQuestionPayload = {
  text: "Sample question",
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
  ],
  correctOptionId: "b",
};

function defaultProfileTable() {
  return {
    profiles: { rows: [{ id: "teacher-1", role: "teacher" }] },
  };
}

describe("GET /api/teacher-dashboard/standards/[standardId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockState.role = "teacher";
    const { client: serverClient } = createMockSupabaseClient({
      user: null,
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({});
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${validStandard}`,
      ),
      buildParams(validStandard),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is student", async () => {
    mockState.role = "student";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("stu"),
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({});
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${validStandard}`,
      ),
      buildParams(validStandard),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown standard id", async () => {
    mockState.role = "teacher";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({});
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request("https://example.com/api/teacher-dashboard/standards/unknown"),
      buildParams("unknown"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid query (range)", async () => {
    mockState.role = "teacher";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({});
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${validStandard}?range=99d`,
      ),
      buildParams(validStandard),
    );
    expect(res.status).toBe(400);
  });

  it("returns empty payload when teacher has no schools", async () => {
    mockState.role = "teacher";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        school_teachers: { rows: [] },
        schools: { rows: [] },
        school_members: { rows: [] },
        profiles: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${validStandard}?range=all`,
      ),
      buildParams(validStandard),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toEqual([]);
    expect(body.summary.totalAttempts).toBe(0);
  });

  it("returns expected aggregates for in-scope attempts", async () => {
    mockState.role = "teacher";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "sch_a", teacher_user_id: "teacher-1" }],
        },
        schools: {
          rows: [{ id: "sch_a", name: "North High", teacher_user_id: null }],
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
              time_spent_sec: 40,
              standard_id: validStandard,
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
              time_spent_sec: 60,
              standard_id: validStandard,
              answered_at: "2026-05-22T08:01:00Z",
              id: "att2",
            },
            {
              user_id: "stu_1",
              question_id: "q2",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "a",
              is_correct: false,
              time_spent_sec: 30,
              standard_id: validStandard,
              answered_at: "2026-05-22T08:02:00Z",
              id: "att3",
            },
            // Out-of-scope: different standard.
            {
              user_id: "stu_1",
              question_id: "other",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "a",
              is_correct: false,
              time_spent_sec: 30,
              standard_id: "3.1.9-12.B",
              answered_at: "2026-05-22T08:03:00Z",
              id: "att4",
            },
          ],
        },
        generated_questions: {
          rows: [
            {
              id: "q1",
              payload: validQuestionPayload,
              updated_at: "2026-04-01",
            },
            {
              id: "q2",
              payload: { ...validQuestionPayload, text: "Q2 stem" },
              updated_at: "2026-04-01",
            },
          ],
        },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${validStandard}?range=all&mode=compare&source=all`,
      ),
      buildParams(validStandard),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(3);
    expect(body.summary.totalCorrect).toBe(1);
    expect(body.summary.questionsAttempted).toBe(2);
    // q2 0% < q1 50% → q2 first.
    expect(body.questions.map((q: { questionId: string }) => q.questionId))
      .toEqual(["q2", "q1"]);
    const q1 = body.questions.find(
      (q: { questionId: string }) => q.questionId === "q1",
    );
    expect(q1.attempted).toBe(2);
    expect(q1.correct).toBe(1);
    expect(q1.byMode.practice.attempted).toBe(2);
    expect(q1.byMode.exam.attempted).toBe(0);
  });

  it("does not leak students from another teacher's school", async () => {
    mockState.role = "teacher";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "sch_a", teacher_user_id: "teacher-1" }],
        },
        schools: {
          rows: [
            { id: "sch_a", name: "North High", teacher_user_id: null },
            { id: "sch_b", name: "South High", teacher_user_id: null },
          ],
        },
        school_members: {
          rows: [
            { school_id: "sch_a", student_user_id: "stu_mine" },
            { school_id: "sch_b", student_user_id: "stu_other" },
          ],
        },
        profiles: {
          rows: [
            {
              id: "stu_mine",
              display_name: "Mine",
              student_id: "M",
              excluded_from_analytics: false,
            },
            {
              id: "stu_other",
              display_name: "Other",
              student_id: "O",
              excluded_from_analytics: false,
            },
          ],
        },
        attempts: {
          rows: [
            {
              user_id: "stu_mine",
              question_id: "q1",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "b",
              is_correct: true,
              time_spent_sec: 30,
              standard_id: validStandard,
              answered_at: "2026-05-22T08:00:00Z",
              id: "att1",
            },
            {
              user_id: "stu_other",
              question_id: "q_should_not_appear",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "a",
              is_correct: false,
              time_spent_sec: 50,
              standard_id: validStandard,
              answered_at: "2026-05-22T08:01:00Z",
              id: "att2",
            },
          ],
        },
        generated_questions: {
          rows: [
            { id: "q1", payload: validQuestionPayload, updated_at: "2026-04-01" },
          ],
        },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${validStandard}?range=all`,
      ),
      buildParams(validStandard),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(1);
    expect(body.questions.map((q: { questionId: string }) => q.questionId))
      .toEqual(["q1"]);
  });

  it("excludes students flagged as excluded_from_analytics", async () => {
    mockState.role = "teacher";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "sch_a", teacher_user_id: "teacher-1" }],
        },
        schools: {
          rows: [{ id: "sch_a", name: "North High", teacher_user_id: null }],
        },
        school_members: {
          rows: [
            { school_id: "sch_a", student_user_id: "stu_ok" },
            { school_id: "sch_a", student_user_id: "stu_excluded" },
          ],
        },
        profiles: {
          rows: [
            {
              id: "stu_ok",
              display_name: "OK",
              student_id: "ok",
              excluded_from_analytics: false,
            },
            {
              id: "stu_excluded",
              display_name: "X",
              student_id: "x",
              excluded_from_analytics: true,
            },
          ],
        },
        attempts: {
          rows: [
            {
              user_id: "stu_ok",
              question_id: "q1",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "b",
              is_correct: true,
              time_spent_sec: 30,
              standard_id: validStandard,
              answered_at: "2026-05-22T08:00:00Z",
              id: "att1",
            },
            {
              user_id: "stu_excluded",
              question_id: "q1",
              mode: "practice",
              assignment_id: null,
              selected_option_id: "a",
              is_correct: false,
              time_spent_sec: 30,
              standard_id: validStandard,
              answered_at: "2026-05-22T08:01:00Z",
              id: "att2",
            },
          ],
        },
        generated_questions: {
          rows: [
            { id: "q1", payload: validQuestionPayload, updated_at: "2026-04-01" },
          ],
        },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${validStandard}?range=all`,
      ),
      buildParams(validStandard),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(1);
  });

  it("narrows when studentId is provided", async () => {
    mockState.role = "teacher";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: defaultProfileTable(),
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        school_teachers: {
          rows: [{ school_id: "sch_a", teacher_user_id: "teacher-1" }],
        },
        schools: {
          rows: [{ id: "sch_a", name: "North High", teacher_user_id: null }],
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
              standard_id: validStandard,
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
              time_spent_sec: 30,
              standard_id: validStandard,
              answered_at: "2026-05-22T08:01:00Z",
              id: "att2",
            },
          ],
        },
        generated_questions: {
          rows: [
            { id: "q1", payload: validQuestionPayload, updated_at: "2026-04-01" },
          ],
        },
        assignment_question_snapshots: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    const res = await GET(
      new Request(
        `https://example.com/api/teacher-dashboard/standards/${validStandard}?range=all&studentId=stu_1`,
      ),
      buildParams(validStandard),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalAttempts).toBe(1);
    expect(body.summary.totalCorrect).toBe(1);
  });
});
