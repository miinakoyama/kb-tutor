import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminRoute: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminRoute: mocks.requireAdminRoute,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { POST } from "./route";

describe("POST /api/admin/kc-coverage/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminRoute.mockResolvedValue({ ok: true, userId: "admin-id" });
  });

  it("replaces a KC mapping through the atomic database function", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { standardId: "3.1.9-12.A", mappingChanged: true },
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });

    const response = await POST(new Request("http://localhost/api/admin/kc-coverage/publish", {
      method: "POST",
      body: JSON.stringify({
        action: "replace_mapping",
        questionSetId: "set-1",
        questionId: "question-1",
        partLabel: null,
        kcCode: "3.1.9-12.A2",
        confirmed: true,
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      standardId: "3.1.9-12.A",
      mappingChanged: true,
    });
    expect(rpc).toHaveBeenCalledWith("replace_question_kc_mapping", {
      p_question_set_id: "set-1",
      p_question_id: "question-1",
      p_part_label: null,
      p_kc_code: "3.1.9-12.A2",
      p_actor: "admin-id",
    });
  });

  it("returns a validation error without attempting a non-atomic fallback", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23514", message: "KC is not active in the question standard" },
    });
    const from = vi.fn();
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc, from });

    const response = await POST(new Request("http://localhost/api/admin/kc-coverage/publish", {
      method: "POST",
      body: JSON.stringify({
        action: "replace_mapping",
        questionSetId: "set-1",
        questionId: "question-1",
        kcCode: "3.1.9-12.Z9",
        confirmed: true,
      }),
    }));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("withdraws a KC mapping through the atomic database function", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { standardId: "3.1.9-12.A", mappingChanged: true },
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });

    const response = await POST(new Request("http://localhost/api/admin/kc-coverage/publish", {
      method: "POST",
      body: JSON.stringify({
        action: "withdraw_mapping",
        questionSetId: "set-1",
        questionId: "question-1",
        partLabel: null,
        confirmed: true,
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      standardId: "3.1.9-12.A",
      mappingChanged: true,
    });
    expect(rpc).toHaveBeenCalledWith("withdraw_question_kc_mapping", {
      p_question_set_id: "set-1",
      p_question_id: "question-1",
      p_part_label: null,
      p_actor: "admin-id",
    });
  });
});
