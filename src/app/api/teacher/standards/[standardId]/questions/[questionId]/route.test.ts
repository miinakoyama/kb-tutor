import { describe, expect, it, vi } from "vitest";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchShortAnswerResponseDetails } from "./route";

describe("fetchShortAnswerResponseDetails", () => {
  it("scopes reused question ids to the resolved generated set", async () => {
    const eqCalls: Array<{ column: string; value: unknown }> = [];
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.in = chain;
    builder.eq = (column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return builder;
    };
    builder.gte = chain;
    builder.not = chain;
    builder.is = chain;
    Object.defineProperty(builder, "then", {
      value: (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
      ) =>
        resolve({
          data: [
            {
              id: "attempt-a",
              user_id: "student-1",
              part_label: "A",
              attempt_number: 1,
              response_text: "Set A response",
              score: 1,
              max_score: 1,
              is_correct: true,
              feedback: { verdict: "correct", segments: [] },
              answered_at: "2026-07-16T10:00:00.000Z",
            },
          ],
          error: null,
        }),
    });
    const admin = {
      from: vi.fn(() => builder),
    } as unknown as ReturnType<typeof createSupabaseAdminClient>;

    const result = await fetchShortAnswerResponseDetails(admin, {
      questionId: "shared-question",
      questionSetId: "set-a",
      studentIds: ["student-1"],
      studentLabelById: new Map([["student-1", "Alex R."]]),
      range: "all",
      mode: "all",
      source: "all",
    });

    expect(eqCalls).toContainEqual({
      column: "question_id",
      value: "shared-question",
    });
    expect(eqCalls).toContainEqual({
      column: "question_set_id",
      value: "set-a",
    });
    expect(result.data).toHaveLength(1);
  });
});
