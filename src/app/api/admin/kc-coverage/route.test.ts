import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminRoute = vi.fn();
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminRoute }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

describe("KC coverage admin route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated access", async () => {
    const { NextResponse } = await import("next/server");
    requireAdminRoute.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/kc-coverage"));
    expect(response.status).toBe(401);
  });

  it("rejects an unknown view before querying coverage", async () => {
    requireAdminRoute.mockResolvedValue({ ok: true, userId: "admin" });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/kc-coverage?view=unknown"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid coverage view" });
  });
});
