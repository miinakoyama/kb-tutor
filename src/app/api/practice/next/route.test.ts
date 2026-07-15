import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";
import sampleItem from "@/data/short-answer/sample-item.json";

const state = vi.hoisted(() => ({
  server: null as SupabaseClient | null,
  admin: null as SupabaseClient | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    if (!state.server) throw new Error("Missing test server");
    return state.server;
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (!state.admin) throw new Error("Missing test admin");
    return state.admin;
  }),
}));

import { POST } from "./route";

describe("POST /api/practice/next", () => {
  it("requires authentication", async () => {
    state.server = createMockSupabaseClient({ user: null }).client;
    const response = await POST(new Request("http://localhost/api/practice/next", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("rejects an empty or unknown standard scope", async () => {
    state.server = createMockSupabaseClient({
      user: { id: "student", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01" },
    }).client;
    const response = await POST(new Request("http://localhost/api/practice/next", {
      method: "POST",
      body: JSON.stringify({ standardIds: ["unknown"] }),
    }));
    expect(response.status).toBe(400);
  });

  it("falls back when any requested standard is not enabled", async () => {
    state.server = createMockSupabaseClient({
      user: { id: "student", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01" },
    }).client;
    state.admin = createMockSupabaseClient({
      tables: {
        school_members: { rows: [{ school_id: "school-a", student_user_id: "student" }] },
        bkt_standard_rollouts: {
          rows: [{ school_id: "school-a", standard_id: "3.1.9-12.A", status: "enabled" }],
        },
      },
    }).client;

    const response = await POST(new Request("http://localhost/api/practice/next", {
      method: "POST",
      body: JSON.stringify({ standardIds: ["3.1.9-12.A", "3.1.9-12.B"] }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      reason: "scope_unavailable",
    });
  });

  it("does not serve a standard enabled only for a school the student is not in", async () => {
    state.server = createMockSupabaseClient({
      user: { id: "student", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01" },
    }).client;
    state.admin = createMockSupabaseClient({
      tables: {
        school_members: { rows: [{ school_id: "school-a", student_user_id: "student" }] },
        // Enabled for school-b only — school-a has never been validated, so its
        // bank may have no question for some KC in this standard.
        bkt_standard_rollouts: {
          rows: [{ school_id: "school-b", standard_id: "3.1.9-12.A", status: "enabled" }],
        },
      },
    }).client;

    const response = await POST(new Request("http://localhost/api/practice/next", {
      method: "POST",
      body: JSON.stringify({ standardIds: ["3.1.9-12.A"] }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      reason: "scope_unavailable",
    });
  });

  it("loads target-KC candidates through the bounded RPC", async () => {
    const user = {
      id: "student",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01",
    };
    state.server = createMockSupabaseClient({ user }).client;
    const legacyShortAnswer = {
      ...sampleItem,
      keyTerms: [
        { term: "prokaryotic", definition: "One KC statement reused for every term." },
        { term: "eukaryotic", definition: "One KC statement reused for every term." },
      ],
    };
    const candidateRpc = vi.fn(async () => ({
      data: ["q1", "q2"].map((id) => ({
        question_set_id: "set-b",
        question_id: id,
        content_version: null,
        has_image: false,
        has_stimulus_image: false,
        format: "saq",
        standard_id: "3.1.9-12.A",
        part_kc_codes: ["3.1.9-12.A1"],
        completed_count: id === "q1" ? 0 : 1,
        last_completed_at: id === "q1" ? null : "2026-01-02T00:00:00Z",
        payload: {
          id,
          module: 1,
          topic: "Genetics",
          standardId: "3.1.9-12.A",
          text: id,
          imageUrl: null,
          options: [],
          correctOptionId: "",
          source: "generated",
          questionType: "open-ended",
          shortAnswer: legacyShortAnswer,
        },
      })),
      error: null,
    }));
    state.admin = createMockSupabaseClient({
      tables: {
        school_members: { rows: [{ school_id: "school-a", student_user_id: "student" }] },
        bkt_standard_rollouts: {
          rows: [{ school_id: "school-a", standard_id: "3.1.9-12.A", status: "enabled" }],
        },
        knowledge_components: {
          rows: [{ code: "3.1.9-12.A1", standard_id: "3.1.9-12.A", catalog_order: 1, active: true }],
        },
        student_kc_mastery: { rows: [] },
        adaptive_rotation_states: { rows: [] },
        adaptive_selection_events: { rows: [] },
      },
      rpcs: {
        get_adaptive_practice_candidates: candidateRpc,
        record_adaptive_selection: async () => ({ data: true, error: null }),
      },
    }).client;

    const response = await POST(new Request("http://localhost/api/practice/next", {
      method: "POST",
      body: JSON.stringify({ standardIds: ["3.1.9-12.A"] }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "selected",
      question: {
        id: "q1",
        questionSetId: "set-b",
        shortAnswer: { keyTerms: [] },
      },
    });
    expect(candidateRpc).toHaveBeenCalledWith({
      p_user_id: "student",
      p_standard_id: "3.1.9-12.A",
      p_target_kc_code: "3.1.9-12.A1",
    });
  });

  const baseUser = {
    id: "student",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01",
  };

  function buildMixedFormatAdmin(candidateRows: Record<string, unknown>[]) {
    return createMockSupabaseClient({
      tables: {
        school_members: { rows: [{ school_id: "school-a", student_user_id: "student" }] },
        bkt_standard_rollouts: {
          rows: [{ school_id: "school-a", standard_id: "3.1.9-12.A", status: "enabled" }],
        },
        knowledge_components: {
          rows: [{ code: "3.1.9-12.A1", standard_id: "3.1.9-12.A", catalog_order: 1, active: true }],
        },
        student_kc_mastery: { rows: [] },
        adaptive_rotation_states: { rows: [] },
        adaptive_selection_events: { rows: [] },
      },
      rpcs: {
        get_adaptive_practice_candidates: async () => ({ data: candidateRows, error: null }),
        record_adaptive_selection: async () => ({ data: true, error: null }),
      },
    }).client;
  }

  it("constrains selection to the requested format (mixed-mode SAQ slot)", async () => {
    state.server = createMockSupabaseClient({ user: baseUser }).client;
    // The MCQ candidate has a lower completed_count, so unconstrained ranking
    // would prefer it — proving the format filter is what picks the SAQ here.
    state.admin = buildMixedFormatAdmin([
      {
        question_set_id: "set-c", question_id: "q-mcq", content_version: null,
        has_image: false, has_stimulus_image: false, format: "mcq",
        standard_id: "3.1.9-12.A", part_kc_codes: ["3.1.9-12.A1"],
        completed_count: 0, last_completed_at: null,
        payload: {
          id: "q-mcq", module: 1, topic: "Genetics", standardId: "3.1.9-12.A",
          text: "q-mcq", imageUrl: null, options: [], correctOptionId: "",
          source: "generated", questionType: "mcq",
        },
      },
      {
        question_set_id: "set-c", question_id: "q-saq", content_version: null,
        has_image: false, has_stimulus_image: false, format: "saq",
        standard_id: "3.1.9-12.A", part_kc_codes: ["3.1.9-12.A1"],
        completed_count: 5, last_completed_at: "2026-01-02T00:00:00Z",
        payload: {
          id: "q-saq", module: 1, topic: "Genetics", standardId: "3.1.9-12.A",
          text: "q-saq", imageUrl: null, options: [], correctOptionId: "",
          source: "generated", questionType: "open-ended",
        },
      },
    ]);

    const response = await POST(new Request("http://localhost/api/practice/next", {
      method: "POST",
      body: JSON.stringify({ standardIds: ["3.1.9-12.A"], requiredFormat: "saq" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "selected",
      question: { id: "q-saq" },
    });
  });

  it("falls back to MCQ when requiredFormat is saq but no SAQ is mapped to the target KC", async () => {
    state.server = createMockSupabaseClient({ user: baseUser }).client;
    state.admin = buildMixedFormatAdmin([
      {
        question_set_id: "set-c", question_id: "q-mcq", content_version: null,
        has_image: false, has_stimulus_image: false, format: "mcq",
        standard_id: "3.1.9-12.A", part_kc_codes: ["3.1.9-12.A1"],
        completed_count: 0, last_completed_at: null,
        payload: {
          id: "q-mcq", module: 1, topic: "Genetics", standardId: "3.1.9-12.A",
          text: "q-mcq", imageUrl: null, options: [], correctOptionId: "",
          source: "generated", questionType: "mcq",
        },
      },
    ]);

    const response = await POST(new Request("http://localhost/api/practice/next", {
      method: "POST",
      body: JSON.stringify({ standardIds: ["3.1.9-12.A"], requiredFormat: "saq" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "selected",
      question: { id: "q-mcq" },
    });
  });
});
