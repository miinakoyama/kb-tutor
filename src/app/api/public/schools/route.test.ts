import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const mockState = vi.hoisted(() => ({
  adminClient: null as SupabaseClient | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (!mockState.adminClient) {
      throw new Error("Test admin client is not configured.");
    }
    return mockState.adminClient;
  }),
}));

import { GET } from "@/app/api/public/schools/route";

describe("GET /api/public/schools", () => {
  it("returns only schools that are not hidden", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        schools: {
          rows: [
            {
              id: "school-visible-1",
              name: "A Visible School",
              is_hidden: false,
              student_login_notice: "Use your email if you forgot your ID.",
            },
            { id: "school-hidden-1", name: "B Hidden School", is_hidden: true },
            { id: "school-visible-2", name: "C Visible School", is_hidden: false },
          ],
        },
      },
    });
    mockState.adminClient = client;

    const response = await GET();
    const body = (await response.json()) as {
      schools: Array<{ id: string; name: string; student_login_notice?: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(
      body.schools.map((school) => ({
        id: school.id,
        name: school.name,
        student_login_notice: school.student_login_notice ?? null,
      })),
    ).toEqual([
      {
        id: "school-visible-1",
        name: "A Visible School",
        student_login_notice: "Use your email if you forgot your ID.",
      },
      { id: "school-visible-2", name: "C Visible School", student_login_notice: null },
    ]);
  });

  it("returns 400 when the query fails", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        schools: {
          rows: [],
          error: { message: "db failure" },
        },
      },
    });
    mockState.adminClient = client;

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("db failure");
  });
});
