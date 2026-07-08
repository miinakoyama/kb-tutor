import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryResult {
  data?: unknown;
  count?: number | null;
  error?: unknown;
}

let currentUser: { id: string } | null = { id: "student-1" };
let requester: { id: string; role: string } | null = null;
let scopedSchools: {
  schools: Array<{ id: string; name: string; teacher_user_id: string | null }>;
} = { schools: [] };
let serverResults: Record<string, QueryResult> = {};
let adminResults: Record<string, QueryResult> = {};

/**
 * Chainable Supabase query stub: every builder method returns itself, awaiting
 * resolves to the configured result, and single/maybeSingle resolve directly.
 */
function chainable(result: QueryResult): unknown {
  const self: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) =>
            resolve({
              data: result.data ?? null,
              count: result.count ?? null,
              error: result.error ?? null,
            });
        }
        if (prop === "single" || prop === "maybeSingle") {
          return async () => ({
            data: result.data ?? null,
            error: result.error ?? null,
          });
        }
        return () => self;
      },
    },
  );
  return self;
}

vi.mock("@/lib/assignments/manage-helpers", () => ({
  getRequester: async () => requester,
  getScopedSchoolIds: async () => scopedSchools,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => chainable(serverResults[table] ?? {}),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => chainable(adminResults[table] ?? {}),
  }),
}));

const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/feedback-reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function makeGet(query = ""): Request {
  return new Request(`http://localhost/api/feedback-reports${query}`, {
    method: "GET",
  });
}

function makePatch(body: unknown): Request {
  return new Request("http://localhost/api/feedback-reports", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function load() {
  return import("./route");
}

beforeEach(() => {
  vi.resetModules();
  currentUser = { id: "student-1" };
  requester = null;
  scopedSchools = { schools: [] };
  serverResults = {};
  adminResults = {};
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/feedback-reports", () => {
  const validBody = {
    attemptId: ATTEMPT_ID,
    note: "The feedback mentions warmth but I never wrote about warmth.",
  };

  beforeEach(() => {
    adminResults["short_answer_attempts"] = {
      data: {
        id: ATTEMPT_ID,
        user_id: "student-1",
        question_id: "sa-sample-0001",
        part_label: "A",
      },
    };
    serverResults["feedback_reports"] = { data: { id: "report-1" } };
  });

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    const { POST } = await load();
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 on a malformed body", async () => {
    const { POST } = await load();
    const res = await POST(makePost({ attemptId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the attempt does not exist", async () => {
    adminResults["short_answer_attempts"] = { data: null };
    const { POST } = await load();
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 for another student's attempt", async () => {
    adminResults["short_answer_attempts"] = {
      data: {
        id: ATTEMPT_ID,
        user_id: "someone-else",
        question_id: "sa-sample-0001",
        part_label: "A",
      },
    };
    const { POST } = await load();
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 409 when the attempt is already reported", async () => {
    serverResults["feedback_reports"] = {
      data: null,
      error: { code: "23505" },
    };
    const { POST } = await load();
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(409);
  });

  it("creates a report and returns 201", async () => {
    const { POST } = await load();
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.reportId).toBe("report-1");
  });

  it("accepts a report without a note", async () => {
    const { POST } = await load();
    const res = await POST(makePost({ attemptId: ATTEMPT_ID }));
    expect(res.status).toBe(201);
  });
});

describe("GET /api/feedback-reports", () => {
  const reportRow = {
    id: REPORT_ID,
    student_user_id: "student-1",
    attempt_id: ATTEMPT_ID,
    question_id: "sa-sample-0001",
    part_label: "A",
    note: "Feedback seems wrong",
    reviewed_at: null,
    reviewed_by: null,
    created_at: "2026-07-08T12:00:00Z",
  };

  beforeEach(() => {
    requester = { id: "teacher-1", role: "teacher" };
    serverResults["feedback_reports"] = { data: [reportRow], count: 1 };
    adminResults["short_answer_attempts"] = {
      data: [
        {
          id: ATTEMPT_ID,
          response_text: "Stomata close to conserve water.",
          score: 0,
          max_score: 1,
          feedback: { verdict: "incorrect", segments: [] },
          method: "2",
          model_id: "gpt-5.4",
          confidence: null,
        },
      ],
    };
    adminResults["profiles"] = {
      data: [{ id: "student-1", display_name: "Alex Kim" }],
    };
    adminResults["generated_questions"] = {
      data: [
        {
          id: "sa-sample-0001",
          payload: { shortAnswer: { stem: "A researcher investigated stomata." } },
        },
      ],
    };
  });

  it("returns 401 when unauthenticated", async () => {
    requester = null;
    const { GET } = await load();
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student", async () => {
    requester = { id: "student-1", role: "student" };
    const { GET } = await load();
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid status filter", async () => {
    const { GET } = await load();
    const res = await GET(makeGet("?status=bogus"));
    expect(res.status).toBe(400);
  });

  it("returns shaped reports for a teacher", async () => {
    const { GET } = await load();
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(1);
    expect(json.reports).toHaveLength(1);
    const report = json.reports[0];
    expect(report.id).toBe(REPORT_ID);
    expect(report.student.displayName).toBe("Alex Kim");
    expect(report.questionPreview).toContain("A researcher investigated");
    expect(report.attempt.responseText).toContain("Stomata close");
    expect(report.attempt.method).toBe("2");
    expect(report.reviewedAt).toBeNull();
  });

  it("returns 403 when a teacher filters by a school they cannot access", async () => {
    scopedSchools = { schools: [{ id: "school-a", name: "A", teacher_user_id: "teacher-1" }] };
    const { GET } = await load();
    const res = await GET(makeGet("?schoolId=school-b"));
    expect(res.status).toBe(403);
  });

  it("returns empty when the school filter has no students", async () => {
    scopedSchools = { schools: [{ id: "school-a", name: "A", teacher_user_id: "teacher-1" }] };
    adminResults["school_members"] = { data: [] };
    const { GET } = await load();
    const res = await GET(makeGet("?schoolId=school-a"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reports).toEqual([]);
    expect(json.total).toBe(0);
  });

  it("handles a missing attempt row gracefully", async () => {
    adminResults["short_answer_attempts"] = { data: [] };
    const { GET } = await load();
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reports[0].attempt).toBeNull();
  });
});

describe("PATCH /api/feedback-reports", () => {
  beforeEach(() => {
    requester = { id: "teacher-1", role: "teacher" };
    serverResults["feedback_reports"] = {
      data: { id: REPORT_ID, reviewed_at: "2026-07-08T13:00:00Z" },
    };
  });

  it("returns 401 when unauthenticated", async () => {
    requester = null;
    const { PATCH } = await load();
    const res = await PATCH(makePatch({ reportId: REPORT_ID, reviewed: true }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student", async () => {
    requester = { id: "student-1", role: "student" };
    const { PATCH } = await load();
    const res = await PATCH(makePatch({ reportId: REPORT_ID, reviewed: true }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on a malformed body", async () => {
    const { PATCH } = await load();
    const res = await PATCH(makePatch({ reportId: "nope", reviewed: "yes" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the report is out of scope or unknown", async () => {
    serverResults["feedback_reports"] = { data: null };
    const { PATCH } = await load();
    const res = await PATCH(makePatch({ reportId: REPORT_ID, reviewed: true }));
    expect(res.status).toBe(404);
  });

  it("marks a report reviewed", async () => {
    const { PATCH } = await load();
    const res = await PATCH(makePatch({ reportId: REPORT_ID, reviewed: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reportId).toBe(REPORT_ID);
    expect(json.reviewedAt).toBe("2026-07-08T13:00:00Z");
  });

  it("clears the reviewed state", async () => {
    serverResults["feedback_reports"] = {
      data: { id: REPORT_ID, reviewed_at: null },
    };
    const { PATCH } = await load();
    const res = await PATCH(makePatch({ reportId: REPORT_ID, reviewed: false }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reviewedAt).toBeNull();
  });
});
