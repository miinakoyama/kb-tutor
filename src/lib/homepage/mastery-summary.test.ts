import { describe, expect, it } from "vitest";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";
import { getMasterySummary } from "@/lib/homepage/mastery-summary";
import { PROGRESS_TOPICS } from "@/lib/progress/mastery";

describe("getMasterySummary", () => {
  it("returns one datum per progress topic with short radar labels, averaging KC probability", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        knowledge_components: {
          rows: [{ code: "3.1.9-12.A.1", standard_id: "3.1.9-12.A", active: true }],
        },
        student_kc_mastery: {
          rows: [{ user_id: "student-1", kc_code: "3.1.9-12.A.1", probability: 0.8 }],
        },
      },
    });

    const data = await getMasterySummary(client, "student-1");
    expect(data).toHaveLength(PROGRESS_TOPICS.length);
    // 3.1.9-12.A is Module A / Structure and Function → "Structure".
    const structure = data.find((d) => d.topic === "Structure");
    expect(structure).toBeDefined();
    expect(structure!.masteryValue).toBe(80);
    // No datum keeps a raw "Module X - …" label.
    expect(data.some((d) => d.topic.startsWith("Module"))).toBe(false);
  });

  it("falls back to the default unobserved probability for KCs with no mastery row", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        knowledge_components: {
          rows: [{ code: "3.1.9-12.A.1", standard_id: "3.1.9-12.A", active: true }],
        },
        student_kc_mastery: { rows: [] },
      },
    });

    const data = await getMasterySummary(client, "student-1");
    const structure = data.find((d) => d.topic === "Structure");
    expect(structure!.masteryValue).toBe(30);
  });

  it("ignores other students' KC mastery rows", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        knowledge_components: {
          rows: [{ code: "3.1.9-12.A.1", standard_id: "3.1.9-12.A", active: true }],
        },
        student_kc_mastery: {
          rows: [{ user_id: "someone-else", kc_code: "3.1.9-12.A.1", probability: 0.95 }],
        },
      },
    });

    const data = await getMasterySummary(client, "student-1");
    const structure = data.find((d) => d.topic === "Structure");
    // No mastery row for this student on this KC → falls back to the default.
    expect(structure!.masteryValue).toBe(30);
  });

  it("degrades to the all-zero shape when the query fails", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        knowledge_components: { rows: [], error: { message: "boom" } },
      },
    });

    const data = await getMasterySummary(client, "student-1");
    expect(data).toHaveLength(PROGRESS_TOPICS.length);
    expect(data.every((d) => d.level === "insufficient_data")).toBe(true);
  });
});
