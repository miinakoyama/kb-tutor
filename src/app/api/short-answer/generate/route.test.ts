import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let requester: { id: string; role: string } | null = { id: "teacher-1", role: "teacher" };
const generate = vi.fn();

vi.mock("@/lib/assignments/manage-helpers", () => ({
  getRequester: async () => requester,
}));

vi.mock("@/lib/short-answer/generation/pipeline", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/short-answer/generation/pipeline")
  >("@/lib/short-answer/generation/pipeline");
  return {
    ...actual,
    generateShortAnswerItem: (...args: unknown[]) => generate(...args),
  };
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/short-answer/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  standardCode: "3.1.9-12.A",
  modelId: "gpt-5.4",
  temperature: 1,
};

const successResult = {
  blueprint: { targetStandard: "3.1.9-12.A" },
  item: { stem: "..." },
  grounding: { studyGuide: { empty: true, chunkIds: [] } },
  metadata: { method: "method2_blueprint_rag_l2" },
};

async function POST(body: unknown) {
  const mod = await import("./route");
  return mod.POST(makeRequest(body));
}

describe("POST /api/short-answer/generate", () => {
  beforeEach(() => {
    vi.resetModules();
    requester = { id: "teacher-1", role: "teacher" };
    generate.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    requester = null;
    const res = await POST(validBody);
    expect(res.status).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 403 for a student", async () => {
    requester = { id: "s-1", role: "student" };
    const res = await POST(validBody);
    expect(res.status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown standard", async () => {
    const res = await POST({ ...validBody, standardCode: "9.9.9-99.Z" });
    expect(res.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown model", async () => {
    const res = await POST({ ...validBody, modelId: "not-a-model" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid stimulus type", async () => {
    const res = await POST({ ...validBody, stimulusType: "none" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an out-of-range temperature", async () => {
    const res = await POST({ ...validBody, temperature: 5 });
    expect(res.status).toBe(400);
  });

  it("returns 200 for a teacher", async () => {
    generate.mockResolvedValue(successResult);
    const res = await POST(validBody);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.metadata.method).toBe("method2_blueprint_rag_l2");
  });

  it("returns 200 for an admin", async () => {
    requester = { id: "admin-1", role: "admin" };
    generate.mockResolvedValue(successResult);
    const res = await POST(validBody);
    expect(res.status).toBe(200);
  });

  it("returns 502 when the pipeline exhausts its retry budget", async () => {
    const { GenerationError } = await import("@/lib/short-answer/generation/pipeline");
    generate.mockRejectedValue(new GenerationError("boom", "item", true));
    const res = await POST(validBody);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("generation_failed");
    expect(json.stage).toBe("item");
    expect(json.retriable).toBe(true);
  });

  it("returns 400 for a non-retriable generation error (bad KC)", async () => {
    const { GenerationError } = await import("@/lib/short-answer/generation/pipeline");
    generate.mockRejectedValue(new GenerationError("bad KC", "blueprint", false));
    const res = await POST({ ...validBody, fixedCoreKC: "3.1.9-12.A99" });
    expect(res.status).toBe(400);
  });
});
