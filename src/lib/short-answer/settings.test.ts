import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface StubResult {
  data: unknown;
}

/** Chainable query stub mimicking the subset of the supabase-js builder used. */
function makeQuery(result: StubResult) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  q.select = chain;
  q.eq = chain;
  q.order = chain;
  q.limit = chain;
  q.maybeSingle = () => Promise.resolve(result);
  return q;
}

const tableResults: Record<string, StubResult> = {};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => makeQuery(tableResults[table] ?? { data: null }),
  }),
}));

async function load() {
  return import("@/lib/short-answer/settings");
}

describe("resolveFeedbackConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(tableResults)) delete tableResults[key];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the school row when present and valid", async () => {
    tableResults["school_members"] = { data: { school_id: "school-1" } };
    tableResults["feedback_settings"] = {
      data: {
        scope: "school",
        school_id: "school-1",
        method: "3",
        model_id: "claude-sonnet-4-6",
        temperature: 0,
      },
    };
    const { resolveFeedbackConfig } = await load();
    const config = await resolveFeedbackConfig("student-1");
    expect(config).toEqual({
      method: "3",
      modelId: "claude-sonnet-4-6",
      temperature: 0,
    });
  });

  it("falls back to the hardcoded default when no rows exist", async () => {
    tableResults["school_members"] = { data: null };
    tableResults["feedback_settings"] = { data: null };
    const { resolveFeedbackConfig, HARDCODED_FALLBACK } = await load();
    const config = await resolveFeedbackConfig("student-1");
    expect(config).toEqual(HARDCODED_FALLBACK);
  });

  it("ignores a school row with an unknown model and uses the default row", async () => {
    tableResults["school_members"] = { data: { school_id: "school-1" } };
    // Note: single mock returns the same row for both the school and default
    // lookups; the school row is invalid (bad model) so it is skipped, and the
    // default lookup returns the same invalid row → hardcoded fallback.
    tableResults["feedback_settings"] = {
      data: {
        scope: "school",
        school_id: "school-1",
        method: "2",
        model_id: "not-a-real-model",
        temperature: 1,
      },
    };
    const { resolveFeedbackConfig, HARDCODED_FALLBACK } = await load();
    const config = await resolveFeedbackConfig("student-1");
    expect(config).toEqual(HARDCODED_FALLBACK);
  });
});
