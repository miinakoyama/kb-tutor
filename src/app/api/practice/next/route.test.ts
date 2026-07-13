import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const state = vi.hoisted(() => ({ server: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    if (!state.server) throw new Error("Missing test server");
    return state.server;
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

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
});
