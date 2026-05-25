import type { AttemptMode } from "@/lib/analytics/teacher-dashboard-server";
import type {
  RangeKey,
  SampleMode,
  ScopeMode,
  SourceFilter,
} from "@/lib/analytics/teacher-analytics-types";

const RANGE_VALUES: readonly RangeKey[] = ["7d", "30d", "all"] as const;
const MODE_VALUES = ["practice", "exam", "review", "compare", "all"] as const;
const ATTEMPT_MODE_VALUES: readonly AttemptMode[] = [
  "practice",
  "exam",
  "review",
] as const;
const SOURCE_VALUES: readonly SourceFilter[] = [
  "assigned",
  "self",
  "all",
] as const;
const SCOPE_VALUES: readonly ScopeMode[] = ["selected", "all"] as const;
const CHART_VIEW_VALUES = ["rolling", "cumulative"] as const;
const SAMPLE_MODE_VALUES: readonly SampleMode[] = [
  "random",
  "high_accuracy_first",
  "low_accuracy_first",
] as const;

type ChartView = (typeof CHART_VIEW_VALUES)[number];
type ExtendedModeFilter = (typeof MODE_VALUES)[number];

export interface TeacherAnalyticsQuery {
  range: RangeKey;
  mode: ExtendedModeFilter;
  source: SourceFilter;
  classId: string | null;
  studentId: string | null;
  topic: string | null;
  scope: ScopeMode;
  assignmentId: string | null;
  standardIdFilter: string | null;
  chartView: ChartView;
  cursor: string | null;
  sampleMode: SampleMode;
  seed: string | null;
  skip: number;
}

export type ParsedQueryResult =
  | { ok: true; query: TeacherAnalyticsQuery }
  | { ok: false; error: string };

const SEED_PATTERN = /^[A-Za-z0-9._\-:]{4,64}$/;

function pickStringParam(params: URLSearchParams, name: string): string | null {
  const raw = params.get(name);
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export function parseTeacherAnalyticsQuery(
  url: URL | URLSearchParams,
): ParsedQueryResult {
  const params = url instanceof URL ? url.searchParams : url;

  const rangeRaw = params.get("range");
  const range =
    rangeRaw === null || rangeRaw === ""
      ? "30d"
      : (RANGE_VALUES.find((value) => value === rangeRaw) ?? null);
  if (range === null) return { ok: false, error: "Invalid query: range" };

  const modeRaw = params.get("mode");
  const mode =
    modeRaw === null || modeRaw === ""
      ? "compare"
      : (MODE_VALUES.find((value) => value === modeRaw) ?? null);
  if (mode === null) return { ok: false, error: "Invalid query: mode" };

  const sourceRaw = params.get("source");
  const source =
    sourceRaw === null || sourceRaw === ""
      ? "all"
      : (SOURCE_VALUES.find((value) => value === sourceRaw) ?? null);
  if (source === null) return { ok: false, error: "Invalid query: source" };

  const scopeRaw = params.get("scope");
  const scope =
    scopeRaw === null || scopeRaw === ""
      ? "selected"
      : (SCOPE_VALUES.find((value) => value === scopeRaw) ?? null);
  if (scope === null) return { ok: false, error: "Invalid query: scope" };

  const chartViewRaw = params.get("chartView");
  const chartView =
    chartViewRaw === null || chartViewRaw === ""
      ? "rolling"
      : (CHART_VIEW_VALUES.find((value) => value === chartViewRaw) ?? null);
  if (chartView === null) {
    return { ok: false, error: "Invalid query: chartView" };
  }

  const sampleModeRaw = params.get("sampleMode");
  const sampleMode =
    sampleModeRaw === null || sampleModeRaw === ""
      ? "random"
      : (SAMPLE_MODE_VALUES.find((value) => value === sampleModeRaw) ?? null);
  if (sampleMode === null) {
    return { ok: false, error: "Invalid query: sampleMode" };
  }

  const seedRaw = params.get("seed");
  let seed: string | null = null;
  if (seedRaw !== null && seedRaw.length > 0) {
    if (!SEED_PATTERN.test(seedRaw)) {
      return { ok: false, error: "Invalid query: seed" };
    }
    seed = seedRaw;
  }

  const skipRaw = params.get("skip");
  let skip = 0;
  if (skipRaw !== null && skipRaw !== "") {
    const parsed = Number.parseInt(skipRaw, 10);
    if (
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      String(parsed) !== skipRaw.trim()
    ) {
      return { ok: false, error: "Invalid query: skip" };
    }
    skip = parsed;
  }

  return {
    ok: true,
    query: {
      range,
      mode,
      source,
      classId: pickStringParam(params, "classId"),
      studentId: pickStringParam(params, "studentId"),
      topic: pickStringParam(params, "topic"),
      scope,
      assignmentId: pickStringParam(params, "assignmentId"),
      standardIdFilter: pickStringParam(params, "standardId"),
      chartView,
      cursor: pickStringParam(params, "cursor"),
      sampleMode,
      seed,
      skip,
    },
  };
}

/**
 * Resolve the request's `mode` filter into a concrete set of attempt
 * modes for SQL filtering.
 *
 * `compare` and `all` map to every mode (caller chooses how to render).
 */
export function attemptModesFromFilter(
  mode: TeacherAnalyticsQuery["mode"],
): AttemptMode[] {
  if (mode === "compare" || mode === "all") return [...ATTEMPT_MODE_VALUES];
  return [mode];
}

export const TEACHER_ANALYTICS_QUERY_DEFAULTS = {
  RANGE: "30d" as const,
  MODE: "compare" as const,
  SOURCE: "all" as const,
  SCOPE: "selected" as const,
  CHART_VIEW: "rolling" as const,
  SAMPLE_MODE: "random" as const,
} as const;
