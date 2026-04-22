import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Question } from "@/types/question";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const mockState = vi.hoisted(() => ({
  serverClient: null as SupabaseClient | null,
  adminClient: null as SupabaseClient | null,
  role: "student" as "student" | "teacher" | "admin" | null,
  deterministicShuffle: vi.fn((items: Question[], _seed: string) => [...items].reverse()),
  resolveReviewQuestionsForAssignment: vi.fn(
    async (
      _admin: SupabaseClient,
      _studentUserId: string,
      _assignmentId: string,
    ) => ({ questions: [] as Question[], error: null as string | null }),
  ),
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

vi.mock("@/lib/student-assignments", () => ({
  deterministicShuffle: (...args: Parameters<typeof mockState.deterministicShuffle>) =>
    mockState.deterministicShuffle(...args),
  resolveReviewQuestionsForAssignment: (
    ...args: Parameters<typeof mockState.resolveReviewQuestionsForAssignment>
  ) => mockState.resolveReviewQuestionsForAssignment(...args),
}));

import { GET } from "@/app/api/assignments/[assignmentId]/questions/route";

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
  return new Request("http://localhost/api/assignments/as_1/questions") as unknown as NextRequest;
}

describe("GET /api/assignments/[assignmentId]/questions", () => {
  it("returns 401 when unauthenticated", async () => {
    const { client: serverClient } = createMockSupabaseClient({ user: null });
    const { client: adminClient } = createMockSupabaseClient();
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "student";

    const response = await GET(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when assignment id is blank", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
      tables: { profiles: { rows: [{ id: "student-1", role: "student" }] } },
    });
    const { client: adminClient } = createMockSupabaseClient();
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "student";

    const response = await GET(requestMock(), contextFor("   "));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing assignment id");
  });

  it("returns 403 for users with no access", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
      tables: { profiles: { rows: [{ id: "student-1", role: "student" }] } },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            {
              id: "as_1",
              school_id: "school-1",
              mode: "practice",
              randomize_order: false,
            },
          ],
        },
        assignment_targets: { rows: [] },
        school_members: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "student";

    const response = await GET(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns practice questions with deterministic shuffle and current-run answered map", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
      tables: { profiles: { rows: [{ id: "student-1", role: "student" }] } },
    });
    const q1 = { id: "q1", text: "Q1" } as Question;
    const q2 = { id: "q2", text: "Q2" } as Question;
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            {
              id: "as_1",
              school_id: "school-1",
              mode: "practice",
              randomize_order: true,
            },
          ],
        },
        assignment_targets: {
          rows: [
            {
              assignment_id: "as_1",
              student_user_id: "student-1",
              last_completed_at: "2026-04-03T00:00:00.000Z",
            },
          ],
        },
        assignment_question_snapshots: {
          rows: [
            { assignment_id: "as_1", order_index: 2, payload: q2 },
            { assignment_id: "as_1", order_index: 1, payload: q1 },
          ],
        },
        attempts: {
          rows: [
            {
              user_id: "student-1",
              assignment_id: "as_1",
              question_id: "q1",
              selected_option_id: "A",
              is_correct: false,
              answered_at: "2026-04-01T12:00:00.000Z",
            },
            {
              user_id: "student-1",
              assignment_id: "as_1",
              question_id: "q2",
              selected_option_id: "C",
              is_correct: false,
              answered_at: "2026-04-05T12:00:00.000Z",
            },
            {
              user_id: "student-1",
              assignment_id: "as_1",
              question_id: "q2",
              selected_option_id: "D",
              is_correct: true,
              answered_at: "2026-04-06T12:00:00.000Z",
            },
            {
              user_id: "student-1",
              assignment_id: "as_1",
              question_id: "q1",
              selected_option_id: "B",
              is_correct: true,
              answered_at: "2026-04-07T12:00:00.000Z",
            },
          ],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "student";
    mockState.deterministicShuffle.mockClear();

    const response = await GET(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as {
      mode: string;
      questions: Question[];
      answered: Record<
        string,
        { selectedOptionId: string | null; isCorrect: boolean; answeredAt: string }
      >;
      last_completed_at: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.mode).toBe("practice");
    expect(body.questions.map((q) => q.id)).toEqual(["q2", "q1"]);
    expect(body.answered).toEqual({
      q2: {
        selectedOptionId: "D",
        isCorrect: true,
        answeredAt: "2026-04-06T12:00:00.000Z",
      },
      q1: {
        selectedOptionId: "B",
        isCorrect: true,
        answeredAt: "2026-04-07T12:00:00.000Z",
      },
    });
    expect(body.last_completed_at).toBe("2026-04-03T00:00:00.000Z");
    expect(mockState.deterministicShuffle).toHaveBeenCalledWith(
      [q1, q2],
      "as_1::student-1",
    );
  });

  it("returns review questions from resolver", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
      tables: { profiles: { rows: [{ id: "student-1", role: "student" }] } },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            {
              id: "as_1",
              school_id: "school-1",
              mode: "review",
              randomize_order: false,
            },
          ],
        },
        assignment_targets: {
          rows: [{ assignment_id: "as_1", student_user_id: "student-1", last_completed_at: null }],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "student";
    mockState.resolveReviewQuestionsForAssignment.mockResolvedValueOnce({
      questions: [{ id: "rq1", text: "Review Q1" } as Question],
      error: null,
    });

    const response = await GET(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as {
      mode: string;
      questions: Question[];
      answered: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.mode).toBe("review");
    expect(body.questions.map((q) => q.id)).toEqual(["rq1"]);
    expect(body.answered).toEqual({});
    expect(mockState.resolveReviewQuestionsForAssignment).toHaveBeenCalledWith(
      mockState.adminClient,
      "student-1",
      "as_1",
    );
  });

  it("allows teacher access through school_teachers mapping", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("teacher-1"),
      tables: { profiles: { rows: [{ id: "teacher-1", role: "teacher" }] } },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            {
              id: "as_1",
              school_id: "school-1",
              mode: "exam",
              randomize_order: false,
            },
          ],
        },
        assignment_targets: { rows: [] },
        school_members: { rows: [] },
        schools: { rows: [] },
        school_teachers: {
          rows: [{ school_id: "school-1", teacher_user_id: "teacher-1" }],
        },
        assignment_question_snapshots: {
          rows: [
            {
              assignment_id: "as_1",
              order_index: 1,
              payload: { id: "q1", text: "Q1" } as Question,
            },
          ],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "teacher";

    const response = await GET(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { questions: Question[]; mode: string };

    expect(response.status).toBe(200);
    expect(body.mode).toBe("exam");
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].id).toBe("q1");
  });

  it("returns 400 when review resolver returns an error", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
      tables: { profiles: { rows: [{ id: "student-1", role: "student" }] } },
    });
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            {
              id: "as_1",
              school_id: "school-1",
              mode: "review",
              randomize_order: false,
            },
          ],
        },
        assignment_targets: {
          rows: [{ assignment_id: "as_1", student_user_id: "student-1", last_completed_at: null }],
        },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "student";
    mockState.resolveReviewQuestionsForAssignment.mockResolvedValueOnce({
      questions: [],
      error: "Failed to resolve review questions.",
    });

    const response = await GET(requestMock(), contextFor("as_1"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Failed to resolve review questions.");
  });

  it("handles 110 concurrent reads with consistent payload shape", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser(),
      tables: { profiles: { rows: [{ id: "student-1", role: "student" }] } },
    });
    const q1 = { id: "q1", text: "Q1" } as Question;
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            {
              id: "as_1",
              school_id: "school-1",
              mode: "practice",
              randomize_order: false,
            },
          ],
        },
        assignment_targets: {
          rows: [{ assignment_id: "as_1", student_user_id: "student-1", last_completed_at: null }],
        },
        assignment_question_snapshots: {
          rows: [{ assignment_id: "as_1", order_index: 1, payload: q1 }],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;
    mockState.role = "student";

    const responses = await Promise.all(
      Array.from({ length: 110 }, () => GET(requestMock(), contextFor("as_1"))),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    const payloads = await Promise.all(
      responses.map((response) =>
        response.json() as Promise<{ questions: Question[]; mode: string }>,
      ),
    );
    expect(payloads.every((payload) => payload.mode === "practice")).toBe(true);
    expect(payloads.every((payload) => payload.questions[0]?.id === "q1")).toBe(
      true,
    );
  });
});
