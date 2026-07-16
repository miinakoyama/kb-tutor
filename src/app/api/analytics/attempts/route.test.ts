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

import { POST } from "@/app/api/analytics/attempts/route";

function makeUser(id: string): User {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-05-01T00:00:00.000Z",
  } as User;
}

function attemptRequest(
  assignmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return new Request("http://localhost/api/analytics/attempts", {
    method: "POST",
    body: JSON.stringify({
      clientAttemptId: "00000000-0000-4000-8000-000000000001",
      questionId: "q1",
      selectedOptionId: "A",
      isCorrect: true,
      mode: "practice",
      assignmentId,
      answeredAt: "2026-05-01T10:00:00.000Z",
      ...overrides,
    }),
  });
}

describe("POST /api/analytics/attempts", () => {
  it("does not trust an assignmentId when the student is outside its scope", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-outside"),
      tables: {
        generated_questions: {
          rows: [{ id: "q1", is_visible: true, payload: { correctOptionId: "A" } }],
        },
      },
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            {
              id: "assignment-1",
              school_id: "school-1",
              created_at: "2026-05-01T00:00:00.000Z",
            },
          ],
        },
        assignment_targets: { rows: [] },
        school_members: { rows: [] },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("assignment-1"));

    expect(response.status).toBe(200);
    expect(tables.attempts.rows).toHaveLength(1);
    expect(tables.attempts.rows[0].assignment_id).toBeNull();
    expect(tables.assignment_targets.rows).toHaveLength(0);
  });

  it("keeps assignmentId when the student is a current school member", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            {
              id: "assignment-1",
              school_id: "school-1",
              created_at: "2026-05-01T00:00:00.000Z",
            },
          ],
        },
        assignment_targets: { rows: [] },
        school_members: {
          rows: [{ school_id: "school-1", student_user_id: "student-1" }],
        },
        assignment_question_snapshots: {
          rows: [{ assignment_id: "assignment-1", question_id: "q1", payload: { correctOptionId: "A" } }],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("assignment-1"));

    expect(response.status).toBe(200);
    expect(tables.attempts.rows).toHaveLength(1);
    expect(tables.attempts.rows[0].assignment_id).toBe("assignment-1");
    expect(tables.assignment_targets.rows).toEqual([
      {
        assignment_id: "assignment-1",
        student_user_id: "student-1",
        created_at: "2026-05-01T00:00:00.000Z",
      },
    ]);
  });

  it("rejects a client-supplied set identity that does not match the snapshot", async () => {
    const snapshotVersion = "00000000-0000-4000-8000-000000000031";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{
            id: "assignment-1",
            school_id: "school-1",
            created_at: "2026-05-01T00:00:00.000Z",
          }],
        },
        assignment_targets: {
          rows: [{ assignment_id: "assignment-1", student_user_id: "student-1" }],
        },
        school_members: { rows: [] },
        assignment_question_snapshots: {
          rows: [{
            assignment_id: "assignment-1",
            question_id: "q1",
            payload: {
              correctOptionId: "A",
              questionSetId: "snapshot-set",
              contentVersion: snapshotVersion,
            },
          }],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("assignment-1", {
      questionSetId: "spoofed-set",
      questionContentVersion: "00000000-0000-4000-8000-000000000032",
    }));

    expect(response.status).toBe(404);
    expect(tables.attempts.rows).toHaveLength(0);
  });

  it("selects the assignment snapshot by set when question ids collide", async () => {
    const setAVersion = "00000000-0000-4000-8000-000000000041";
    const setBVersion = "00000000-0000-4000-8000-000000000042";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{
            id: "assignment-1",
            school_id: "school-1",
            created_at: "2026-05-01T00:00:00.000Z",
          }],
        },
        assignment_targets: {
          rows: [{ assignment_id: "assignment-1", student_user_id: "student-1" }],
        },
        school_members: { rows: [] },
        assignment_question_snapshots: {
          rows: [
            {
              assignment_id: "assignment-1",
              question_id: "q1",
              payload: {
                correctOptionId: "A",
                questionSetId: "set-a",
                contentVersion: setAVersion,
              },
            },
            {
              assignment_id: "assignment-1",
              question_id: "q1",
              payload: {
                correctOptionId: "B",
                questionSetId: "set-b",
                contentVersion: setBVersion,
              },
            },
          ],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("assignment-1", {
      questionSetId: "set-b",
      questionContentVersion: setBVersion,
      selectedOptionId: "B",
      mode: "exam",
      isFinalized: false,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ isCorrect: true });
    expect(tables.attempts.rows[0]).toMatchObject({
      question_set_id: "set-b",
      question_content_version: setBVersion,
      is_correct: true,
      is_finalized: false,
    });
  });

  it("rejects ambiguous assignment snapshots with the same identity", async () => {
    const version = "00000000-0000-4000-8000-000000000043";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{
            id: "assignment-1",
            school_id: "school-1",
            created_at: "2026-05-01T00:00:00.000Z",
          }],
        },
        assignment_targets: {
          rows: [{ assignment_id: "assignment-1", student_user_id: "student-1" }],
        },
        school_members: { rows: [] },
        assignment_question_snapshots: {
          rows: ["A", "B"].map((correctOptionId) => ({
            assignment_id: "assignment-1",
            question_id: "q1",
            payload: {
              correctOptionId,
              questionSetId: "set-a",
              contentVersion: version,
            },
          })),
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("assignment-1", {
      questionSetId: "set-a",
      questionContentVersion: version,
    }));

    expect(response.status).toBe(404);
    expect(tables.attempts.rows).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledWith(
      "Ambiguous assignment question snapshot identity",
      expect.objectContaining({ matchingSnapshotCount: 2 }),
    );
    consoleError.mockRestore();
  });

  it("recomputes correctness from authorized content instead of trusting the client", async () => {
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
      tables: {
        generated_questions: {
          rows: [{ id: "q1", is_visible: true, payload: { correctOptionId: "B" } }],
        },
      },
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: { attempts: { rows: [] } },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("", {
      isFinalized: false,
      questionCompleted: false,
    }));

    expect(response.status).toBe(200);
    expect(tables.attempts.rows[0].is_correct).toBe(false);
    expect(tables.attempts.rows[0].is_finalized).toBe(true);
    expect(tables.attempts.rows[0].question_completed).toBe(false);
    await expect(response.json()).resolves.toMatchObject({ isCorrect: false });
  });

  it("scores a delayed attempt against its answer-time question version", async () => {
    const oldVersion = "00000000-0000-4000-8000-000000000010";
    const currentVersion = "00000000-0000-4000-8000-000000000011";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
      tables: {
        generated_questions: {
          rows: [{
            set_id: "set-1",
            id: "q1",
            is_visible: true,
            content_version: currentVersion,
            payload: { correctOptionId: "B" },
          }],
        },
      },
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        generated_question_versions: {
          rows: [{
            question_set_id: "set-1",
            question_id: "q1",
            content_version: oldVersion,
            payload: { correctOptionId: "A" },
          }],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("", {
      questionSetId: "set-1",
      questionContentVersion: oldVersion,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ isCorrect: true });
    expect(tables.attempts.rows[0]).toMatchObject({
      question_set_id: "set-1",
      question_content_version: oldVersion,
      is_correct: true,
    });
  });

  it("scores a queued version after the question is removed from Self Practice", async () => {
    const answeredVersion = "00000000-0000-4000-8000-000000000014";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
      tables: {
        // RLS would hide the current row after include_in_self_practice=false.
        generated_questions: { rows: [] },
      },
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        generated_question_versions: {
          rows: [{
            question_set_id: "set-1",
            question_id: "q1",
            content_version: answeredVersion,
            payload: { correctOptionId: "A" },
          }],
        },
        school_question_sets: {
          rows: [{ school_id: "school-1", set_id: "set-1" }],
        },
        school_members: {
          rows: [{ school_id: "school-1", student_user_id: "student-1" }],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("", {
      questionSetId: "set-1",
      questionContentVersion: answeredVersion,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ isCorrect: true });
    expect(tables.attempts.rows[0]).toMatchObject({
      question_set_id: "set-1",
      question_content_version: answeredVersion,
      is_correct: true,
    });
  });

  it("uses questionSetId to distinguish duplicate question ids", async () => {
    const setTwoVersion = "00000000-0000-4000-8000-000000000012";
    const { client: serverClient } = createMockSupabaseClient({
      user: makeUser("student-1"),
      tables: {
        generated_questions: {
          rows: [
            {
              set_id: "set-1",
              id: "q1",
              is_visible: true,
              content_version: "00000000-0000-4000-8000-000000000013",
              payload: { correctOptionId: "A" },
            },
            {
              set_id: "set-2",
              id: "q1",
              is_visible: true,
              content_version: setTwoVersion,
              payload: { correctOptionId: "B" },
            },
          ],
        },
      },
    });
    const { client: adminClient, tables } = createMockSupabaseClient({
      tables: {
        generated_question_versions: {
          rows: [{
            question_set_id: "set-2",
            question_id: "q1",
            content_version: setTwoVersion,
            payload: { correctOptionId: "B" },
          }],
        },
        attempts: { rows: [] },
      },
    });
    mockState.serverClient = serverClient;
    mockState.adminClient = adminClient;

    const response = await POST(attemptRequest("", {
      questionSetId: "set-2",
      questionContentVersion: setTwoVersion,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ isCorrect: false });
    expect(tables.attempts.rows[0].question_set_id).toBe("set-2");
  });
});
