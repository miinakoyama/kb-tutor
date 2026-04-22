import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";

const mockState = vi.hoisted(() => ({
  adminClient: null as SupabaseClient | null,
  createServerClient: vi.fn(async () => {
    throw new Error("createSupabaseServerClient should not be called in this test");
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (!mockState.adminClient) {
      throw new Error("Test admin client is not configured.");
    }
    return mockState.adminClient;
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockState.createServerClient,
}));

import { POST } from "@/app/api/auth/login/route";

function makeStudentLoginRequest(body: { schoolId?: string; studentId?: string }) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "student",
      ...body,
    }),
  });
}

describe("POST /api/auth/login (student)", () => {
  it("returns 404 when the selected school is hidden", async () => {
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        schools: {
          rows: [{ id: "school-hidden", is_hidden: true }],
        },
      },
    });
    mockState.adminClient = adminClient;
    mockState.createServerClient.mockClear();

    const response = await POST(
      makeStudentLoginRequest({
        schoolId: "school-hidden",
        studentId: "st000000001",
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("School not found.");
    expect(mockState.createServerClient).not.toHaveBeenCalled();
  });

  it("returns 400 when student ID does not match school validation pattern", async () => {
    const { client: adminClient } = createMockSupabaseClient({
      tables: {
        schools: {
          rows: [
            {
              id: "school-visible",
              is_hidden: false,
              student_id_validation_pattern: "^st\\d{9}$",
              student_id_validation_hint: "Example: st004720601",
            },
          ],
        },
      },
    });
    mockState.adminClient = adminClient;
    mockState.createServerClient.mockClear();

    const response = await POST(
      makeStudentLoginRequest({
        schoolId: "school-visible",
        studentId: "alice@example.com",
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid student ID format. Example: st004720601");
    expect(mockState.createServerClient).not.toHaveBeenCalled();
  });
});
