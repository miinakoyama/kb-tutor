import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";

const item = sampleItem as ShortAnswerItem;

let currentUser: { id: string } | null = { id: "student-1" };
const tableState: Record<string, { select: unknown }> = {};
const adminTableState: Record<string, { select: unknown }> = {};
let insertResult: { data: unknown; error: unknown } = {
  data: { id: "attempt-1" },
  error: null,
};

const loadPart = vi.fn();
const resolveConfig = vi.fn();
const gradePart = vi.fn();
const canStudentAccessAssignment = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.gt = chain;
      builder.maybeSingle = async () => ({
        data: adminTableState[table]?.select ?? null,
      });
      builder.insert = () => ({
        select: () => ({
          single: async () => insertResult,
        }),
      });
      return builder;
    },
  }),
}));
vi.mock("@/lib/assignments/access", () => ({
  canStudentAccessAssignment: (...args: unknown[]) =>
    canStudentAccessAssignment(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.gt = chain;
      builder.maybeSingle = async () => ({
        data: tableState[table]?.select ?? null,
      });
      builder.insert = () => ({
        select: () => ({
          single: async () => insertResult,
        }),
        // For the summary `attempts` insert (no .select()).
        then: undefined,
      });
      return builder;
    },
  }),
}));

vi.mock("@/lib/short-answer/assignment-run", () => ({
  resolveAssignmentRunAfter: vi.fn().mockResolvedValue(null),
  applyAssignmentRunFilter: (query: { is: (col: string, val: null) => unknown }) =>
    query.is("assignment_run_after", null),
}));

vi.mock("@/lib/short-answer/load-item", () => ({
  loadShortAnswerPart: (...args: unknown[]) => loadPart(...args),
}));
vi.mock("@/lib/short-answer/settings", () => ({
  resolveFeedbackConfig: (...args: unknown[]) => resolveConfig(...args),
}));
vi.mock("@/lib/short-answer/grading", () => ({
  gradePart: (...args: unknown[]) => gradePart(...args),
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/short-answer/grade", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  questionId: "sa-sample-0001",
  questionSetId: null,
  assignmentId: null,
  partLabel: "A",
  studentResponse: "mRNA carries the code to the ribosome",
  attemptNumber: 1,
  mode: "practice",
  clientAttemptId: "11111111-1111-4111-8111-111111111111",
};

async function load() {
  return import("./route");
}

describe("POST /api/short-answer/grade", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser = { id: "student-1" };
    for (const key of Object.keys(tableState)) delete tableState[key];
    for (const key of Object.keys(adminTableState)) delete adminTableState[key];
    adminTableState["assignments"] = { select: { school_id: "school-1" } };
    insertResult = { data: { id: "attempt-1" }, error: null };
    loadPart.mockReset();
    resolveConfig.mockReset();
    gradePart.mockReset();
    canStudentAccessAssignment.mockReset();
    canStudentAccessAssignment.mockResolvedValue(true);
    loadPart.mockResolvedValue({ item, part: item.parts[0] });
    resolveConfig.mockResolvedValue({
      method: "2",
      modelId: "gpt-5.4",
      temperature: 1,
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    const { POST } = await load();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 on a malformed body", async () => {
    const { POST } = await load();
    const res = await POST(makeRequest({ ...validBody, partLabel: "Z" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the question is not a short-answer item", async () => {
    loadPart.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("grades a correct answer and does not reveal a model answer", async () => {
    gradePart.mockResolvedValue({
      score: 1,
      maxScore: 1,
      correct: true,
      feedback: { verdict: "correct", segments: [{ label: "What you got", text: "Right." }] },
      tokenCount: 12,
      latencyMs: 100,
    });
    const { POST } = await load();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.correct).toBe(true);
    expect(json.resolved).toBe(true);
    expect(json.feedback.modelAnswer).toBeUndefined();
    expect(resolveConfig).toHaveBeenCalledWith("student-1", { schoolId: null });
  });

  it("records an empty submission without calling the grader", async () => {
    const { POST } = await load();
    const res = await POST(
      makeRequest({ ...validBody, studentResponse: "   " }),
    );
    expect(res.status).toBe(200);
    expect(gradePart).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.score).toBe(0);
    expect(json.feedback.verdict).toBe("no_response");
  });

  it("returns 502 and writes nothing when grading fails", async () => {
    gradePart.mockRejectedValue(new Error("llm down"));
    const { POST } = await load();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("grading_unavailable");
  });

  it("replays an idempotent attempt from the stored row", async () => {
    tableState["short_answer_attempts"] = {
      select: {
        id: "attempt-1",
        score: 1,
        max_score: 1,
        is_correct: true,
        feedback: { verdict: "correct", segments: [] },
        confidence: null,
        attempt_number: 1,
      },
    };
    const { POST } = await load();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(gradePart).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.attemptId).toBe("attempt-1");
    expect(json.resolved).toBe(true);
  });

  it("returns 403 when the student cannot access the assignment", async () => {
    canStudentAccessAssignment.mockResolvedValue(false);
    const { POST } = await load();
    const res = await POST(
      makeRequest({ ...validBody, assignmentId: "asg-1" }),
    );
    expect(res.status).toBe(403);
    expect(loadPart).not.toHaveBeenCalled();
  });

  it("loads assignment snapshots via the admin client when assignmentId is set", async () => {
    gradePart.mockResolvedValue({
      score: 1,
      maxScore: 1,
      correct: true,
      feedback: { verdict: "correct", segments: [{ label: "What you got", text: "Right." }] },
    });
    const { POST } = await load();
    const res = await POST(
      makeRequest({ ...validBody, assignmentId: "asg-1" }),
    );
    expect(res.status).toBe(200);
    expect(canStudentAccessAssignment).toHaveBeenCalledWith(
      expect.anything(),
      "student-1",
      "asg-1",
    );
    expect(loadPart).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        assignmentId: "asg-1",
        questionId: validBody.questionId,
      }),
    );
    expect(resolveConfig).toHaveBeenCalledWith("student-1", {
      schoolId: "school-1",
    });
  });
});
