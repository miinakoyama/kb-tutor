import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

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
        bkt_standard_rollouts: {
          rows: [{ standard_id: "3.1.9-12.A", status: "enabled" }],
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

  it("does not treat an unscoped SAQ summary from another set as answer history", async () => {
    const user = {
      id: "student",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01",
    };
    state.server = createMockSupabaseClient({
      user,
      tables: {
        school_question_sets: { rows: [{ set_id: "set-b" }] },
        generated_question_sets: {
          rows: [{ id: "set-b", name: "Set B", generated_at: "2026-01-01" }],
        },
        generated_questions: {
          rows: ["q1", "q2"].map((id) => ({
            id,
            set_id: "set-b",
            include_in_self_practice: true,
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
            },
          })),
        },
      },
    }).client;
    state.admin = createMockSupabaseClient({
      tables: {
        bkt_standard_rollouts: {
          rows: [{ standard_id: "3.1.9-12.A", status: "enabled" }],
        },
        knowledge_components: {
          rows: [{ code: "3.1.9-12.A1", standard_id: "3.1.9-12.A", catalog_order: 1, active: true }],
        },
        student_kc_mastery: { rows: [] },
        adaptive_rotation_states: { rows: [] },
        adaptive_selection_events: { rows: [] },
        question_kc_assignments: {
          rows: ["q1", "q2"].map((questionId) => ({
            question_set_id: "set-b",
            question_id: questionId,
            part_label: "A",
            format: "saq",
            standard_id: "3.1.9-12.A",
            kc_code: "3.1.9-12.A1",
            status: "confirmed",
            valid_to: null,
          })),
        },
        attempts: {
          rows: [{
            user_id: "student",
            question_set_id: null,
            question_id: "q1",
            selected_option_id: "short-answer",
            answered_at: "2026-01-02T00:00:00Z",
          }],
        },
        short_answer_attempts: {
          rows: [{
            user_id: "student",
            question_set_id: "set-a",
            question_id: "q1",
            answered_at: "2026-01-02T00:00:00Z",
          }],
        },
      },
      rpcs: {
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
      question: { id: "q1", questionSetId: "set-b" },
    });
  });
});
