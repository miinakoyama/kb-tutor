import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let requester: { id: string; role: string } | null = { id: "teacher-1", role: "teacher" };
let scopedSchools: { schools: { id: string; name: string }[] } = {
  schools: [{ id: "school-1", name: "Biology P3" }],
};

let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let singleResult: { data: unknown; error?: unknown } = { data: null };
let mutationResult: { error: unknown } = { error: null };
const upsert = vi.fn(() => Promise.resolve(mutationResult));
const deleteChain = {
  eq: vi.fn(function (this: unknown) {
    return deleteChain;
  }),
  then: (resolve: (v: { error: unknown }) => void) => resolve(mutationResult),
};

vi.mock("@/lib/assignments/manage-helpers", () => ({
  getRequester: async () => requester,
  getScopedSchoolIds: async () => scopedSchools,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.order = chain;
      builder.in = chain;
      builder.update = () => ({ eq: () => Promise.resolve(mutationResult) });
      builder.insert = () => Promise.resolve(mutationResult);
      builder.upsert = upsert;
      builder.delete = () => deleteChain;
      builder.maybeSingle = async () => singleResult;
      builder.then = (resolve: (v: unknown) => void) => resolve(selectResult);
      return builder;
    },
  }),
}));

function req(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/feedback-settings", {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function load() {
  return import("./route");
}

describe("/api/feedback-settings", () => {
  beforeEach(() => {
    vi.resetModules();
    requester = { id: "teacher-1", role: "teacher" };
    scopedSchools = { schools: [{ id: "school-1", name: "Biology P3" }] };
    selectResult = { data: [], error: null };
    singleResult = { data: null };
    mutationResult = { error: null };
    upsert.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("GET returns 401 when unauthenticated", async () => {
    requester = null;
    const { GET } = await load();
    expect((await GET()).status).toBe(401);
  });

  it("GET returns 403 for a student", async () => {
    requester = { id: "s-1", role: "student" };
    const { GET } = await load();
    expect((await GET()).status).toBe(403);
  });

  it("GET returns methods, models, default, and schools with inherited flag", async () => {
    const { GET } = await load();
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.methods).toHaveLength(3);
    expect(json.models.length).toBeGreaterThan(0);
    expect(json.default.method).toBe("2");
    expect(json.default.editable).toBe(false);
    expect(json.schools).toEqual([
      {
        schoolId: "school-1",
        schoolName: "Biology P3",
        setting: null,
        inherited: true,
      },
    ]);
  });

  it("GET marks the default editable for admins", async () => {
    requester = { id: "admin-1", role: "admin" };
    const { GET } = await load();
    const json = await (await GET()).json();
    expect(json.default.editable).toBe(true);
  });

  it("PUT rejects a teacher writing a foreign school (403)", async () => {
    scopedSchools = { schools: [{ id: "school-1", name: "Biology P3" }] };
    const { PUT } = await load();
    const res = await PUT(
      req("PUT", {
        scope: "school",
        schoolId: "school-999",
        method: "3",
        modelId: "claude-sonnet-4-6",
        temperature: 0,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("PUT rejects a teacher editing the default scope (403)", async () => {
    const { PUT } = await load();
    const res = await PUT(
      req("PUT", { scope: "default", method: "2", modelId: "gpt-5.4", temperature: 1 }),
    );
    expect(res.status).toBe(403);
  });

  it("PUT allows an admin to set the default (200)", async () => {
    requester = { id: "admin-1", role: "admin" };
    const { PUT } = await load();
    const res = await PUT(
      req("PUT", { scope: "default", method: "2", modelId: "gpt-5.4", temperature: 1 }),
    );
    expect(res.status).toBe(200);
  });

  it("PUT returns 400 for an invalid model", async () => {
    const { PUT } = await load();
    const res = await PUT(
      req("PUT", {
        scope: "school",
        schoolId: "school-1",
        method: "3",
        modelId: "nope",
        temperature: 0,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT returns 400 for an out-of-range temperature", async () => {
    const { PUT } = await load();
    const res = await PUT(
      req("PUT", {
        scope: "school",
        schoolId: "school-1",
        method: "3",
        modelId: "claude-sonnet-4-6",
        temperature: 5,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT reset reverts a school to the inherited default", async () => {
    const { PUT } = await load();
    const res = await PUT(
      req("PUT", { scope: "school", schoolId: "school-1", reset: true }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reset).toBe(true);
  });

  it("PUT upserts a valid school setting (200)", async () => {
    const { PUT } = await load();
    const res = await PUT(
      req("PUT", {
        scope: "school",
        schoolId: "school-1",
        method: "3",
        modelId: "claude-sonnet-4-6",
        temperature: 0,
      }),
    );
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
  });
});
