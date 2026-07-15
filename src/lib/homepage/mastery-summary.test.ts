import { describe, expect, it } from "vitest";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";
import { getMasterySummary } from "@/lib/homepage/mastery-summary";
import { PROGRESS_TOPICS } from "@/lib/progress/mastery";

const RECENT = new Date().toISOString();

describe("getMasterySummary", () => {
  it("returns one datum per progress topic with short radar labels", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        attempts: {
          rows: [
            {
              user_id: "student-1",
              is_correct: true,
              answered_at: RECENT,
              topic: null,
              standard_id: "3.1.9-12.A",
            },
          ],
        },
      },
    });

    const data = await getMasterySummary(client, "student-1");
    expect(data).toHaveLength(PROGRESS_TOPICS.length);
    // 3.1.9-12.A is Module A / Structure and Function → "Structure".
    const structure = data.find((d) => d.topic === "Structure");
    expect(structure).toBeDefined();
    expect(structure!.attempts).toBe(1);
    // No datum keeps a raw "Module X - …" label.
    expect(data.some((d) => d.topic.startsWith("Module"))).toBe(false);
  });

  it("ignores other students' attempts", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        attempts: {
          rows: [
            {
              user_id: "someone-else",
              is_correct: true,
              answered_at: RECENT,
              topic: null,
              standard_id: "3.1.9-12.A",
            },
          ],
        },
      },
    });

    const data = await getMasterySummary(client, "student-1");
    expect(data.every((d) => d.attempts === 0)).toBe(true);
  });

  it("degrades to the all-zero shape when the query fails", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        attempts: { rows: [], error: { message: "boom" } },
      },
    });

    const data = await getMasterySummary(client, "student-1");
    expect(data).toHaveLength(PROGRESS_TOPICS.length);
    expect(data.every((d) => d.level === "insufficient_data")).toBe(true);
  });
});
