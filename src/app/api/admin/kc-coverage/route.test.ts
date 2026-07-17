import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminRoute = vi.fn();
const createSupabaseAdminClient = vi.fn();
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminRoute }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

type Row = Record<string, unknown>;

interface Query {
  select: (columns?: string) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: unknown[]) => Query;
  neq: (column: string, value: unknown) => Query;
  order: (column?: string, options?: unknown) => Query;
  range: (from: number, to: number) => Query;
  then: (resolve: (result: { data: Row[]; error: null }) => void) => void;
}

// Minimal PostgREST stand-in: applies eq/in/neq filters and honours range so a
// paged read behaves the way the real client does.
function buildQuery(rows: Row[]): Query {
  let current = [...rows];
  let from = 0;
  let to = Number.POSITIVE_INFINITY;
  const query: Query = {
    select: () => query,
    order: () => query,
    eq: (column, value) => {
      current = current.filter((row) => row[column] === value);
      return query;
    },
    neq: (column, value) => {
      current = current.filter((row) => row[column] !== value);
      return query;
    },
    in: (column, values) => {
      current = current.filter((row) => values.includes(row[column]));
      return query;
    },
    range: (start, end) => {
      from = start;
      to = end;
      return query;
    },
    then: (resolve) =>
      resolve({
        data: current.slice(from, Number.isFinite(to) ? to + 1 : undefined),
        error: null,
      }),
  };
  return query;
}

function mockDb(tables: Record<string, Row[]>) {
  createSupabaseAdminClient.mockReturnValue({
    from: (table: string) => buildQuery(tables[table] ?? []),
  });
}

function coverageRow(overrides: Row): Row {
  return {
    standard_id: "S1",
    question_set_id: "set-a",
    question_id: "q1",
    format: "mcq",
    include_in_self_practice: true,
    coverage_state: "valid",
    confirmed_kc_codes: ["S1.K1"],
    ...overrides,
  };
}

async function loadCoverage(url: string): Promise<Row[]> {
  const { GET } = await import("./route");
  const response = await GET(new Request(url));
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { rows: Row[] };
  return payload.rows;
}

describe("KC coverage admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

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

  it("reports a question count for every active KC, including those with none", async () => {
    requireAdminRoute.mockResolvedValue({ ok: true, userId: "admin" });
    mockDb({
      bkt_question_coverage: [
        coverageRow({ question_id: "q1", confirmed_kc_codes: ["S1.K1"] }),
        coverageRow({ question_id: "q2", confirmed_kc_codes: ["S1.K1"] }),
        coverageRow({ question_id: "q3", confirmed_kc_codes: ["S1.K2"] }),
      ],
      knowledge_components: [
        { code: "S1.K1", standard_id: "S1", statement: "one", active: true },
        { code: "S1.K2", standard_id: "S1", statement: "two", active: true },
        { code: "S1.K3", standard_id: "S1", statement: "three", active: true },
      ],
      bkt_standard_rollouts: [],
      schools: [],
    });

    const [row] = await loadCoverage("http://localhost/api/admin/kc-coverage");
    expect(row.kcs).toEqual([
      { code: "S1.K1", statement: "one", questionCount: 2 },
      { code: "S1.K2", statement: "two", questionCount: 1 },
      { code: "S1.K3", statement: "three", questionCount: 0 },
    ]);
    expect(row.coveredKcCount).toBe(2);
    expect(row.activeKcCount).toBe(3);
    // K3 has no item at all; K2 has one, so nothing to rotate to once answered.
    expect(row.emptyKcCount).toBe(1);
    expect(row.thinKcCount).toBe(1);
  });

  it("counts only questions adaptive Practice can actually serve", async () => {
    requireAdminRoute.mockResolvedValue({ ok: true, userId: "admin" });
    mockDb({
      bkt_question_coverage: [
        coverageRow({ question_id: "q1" }),
        coverageRow({ question_id: "q2", coverage_state: "unresolved" }),
        coverageRow({ question_id: "q3", include_in_self_practice: false, coverage_state: "excluded" }),
      ],
      knowledge_components: [{ code: "S1.K1", standard_id: "S1", statement: "one", active: true }],
      bkt_standard_rollouts: [],
      schools: [],
    });

    const [row] = await loadCoverage("http://localhost/api/admin/kc-coverage");
    expect(row.kcs).toEqual([{ code: "S1.K1", statement: "one", questionCount: 1 }]);
    expect(row.questionCount).toBe(3);
  });

  it("scopes coverage to one school's question bank", async () => {
    requireAdminRoute.mockResolvedValue({ ok: true, userId: "admin" });
    mockDb({
      school_question_sets: [
        { school_id: "school-a", set_id: "set-a" },
        { school_id: "school-b", set_id: "set-b" },
      ],
      bkt_question_coverage: [
        coverageRow({ question_id: "q1", question_set_id: "set-a", confirmed_kc_codes: ["S1.K1"] }),
        coverageRow({ question_id: "q2", question_set_id: "set-b", confirmed_kc_codes: ["S1.K2"] }),
      ],
      knowledge_components: [
        { code: "S1.K1", standard_id: "S1", statement: "one", active: true },
        { code: "S1.K2", standard_id: "S1", statement: "two", active: true },
      ],
      bkt_standard_rollouts: [],
      schools: [{ id: "school-a", name: "School A" }],
    });

    // Combined, both KCs look covered.
    const [combined] = await loadCoverage("http://localhost/api/admin/kc-coverage");
    expect(combined.emptyKcCount).toBe(0);

    // School A only owns set-a, so K2 has no question it can ever be served.
    const [scoped] = await loadCoverage("http://localhost/api/admin/kc-coverage?schoolId=school-a");
    expect(scoped.kcs).toEqual([
      { code: "S1.K1", statement: "one", questionCount: 1 },
      { code: "S1.K2", statement: "two", questionCount: 0 },
    ]);
    expect(scoped.emptyKcCount).toBe(1);
  });

  it("aggregates over every coverage row, not just the first page", async () => {
    requireAdminRoute.mockResolvedValue({ ok: true, userId: "admin" });
    mockDb({
      bkt_question_coverage: Array.from({ length: 1200 }, (_, index) =>
        coverageRow({ question_id: `q${index}`, confirmed_kc_codes: ["S1.K1"] }),
      ),
      knowledge_components: [{ code: "S1.K1", standard_id: "S1", statement: "one", active: true }],
      bkt_standard_rollouts: [],
      schools: [],
    });

    const [row] = await loadCoverage("http://localhost/api/admin/kc-coverage");
    expect(row.questionCount).toBe(1200);
    expect(row.kcs).toEqual([{ code: "S1.K1", statement: "one", questionCount: 1200 }]);
  });

  it("keeps a standard visible when the selected school has no question for it", async () => {
    requireAdminRoute.mockResolvedValue({ ok: true, userId: "admin" });
    mockDb({
      school_question_sets: [{ school_id: "school-a", set_id: "set-a" }],
      bkt_question_coverage: [
        coverageRow({ standard_id: "S1", question_set_id: "set-a", confirmed_kc_codes: ["S1.K1"] }),
      ],
      knowledge_components: [
        { code: "S1.K1", standard_id: "S1", statement: "one", active: true },
        { code: "S2.K1", standard_id: "S2", statement: "other", active: true },
      ],
      bkt_standard_rollouts: [],
      schools: [{ id: "school-a", name: "School A" }],
    });

    const rows = await loadCoverage("http://localhost/api/admin/kc-coverage?schoolId=school-a");
    const s2 = rows.find((row) => row.standardId === "S2");
    expect(s2).toBeDefined();
    expect(s2?.questionCount).toBe(0);
    expect(s2?.emptyKcCount).toBe(1);
  });
});
