import type { PerformanceThresholds } from "@/lib/analytics/constants";

export type ParseThresholdsBodyResult =
  | { ok: true; body: PerformanceThresholds }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseThresholdGroup(
  raw: unknown,
): Partial<PerformanceThresholds> | string | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return "Thresholds must be an object.";

  const keys = ["basicMin", "proficientMin", "advancedMin"] as const;
  const values: Partial<PerformanceThresholds> = {};
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined) return `Missing ${key}.`;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${key} must be a finite number.`;
    }
    values[key] = value;
  }

  return values;
}

function isFlatThresholdPayload(raw: Record<string, unknown>): boolean {
  return (
    raw.basicMin !== undefined
    || raw.proficientMin !== undefined
    || raw.advancedMin !== undefined
  );
}

export function parsePerformanceThresholdsBody(
  raw: unknown,
): ParseThresholdsBodyResult {
  if (!isRecord(raw)) {
    return { ok: false, error: "Request body must be an object." };
  }

  if (isFlatThresholdPayload(raw)) {
    const direct = parseThresholdGroup(raw);
    if (typeof direct === "string") return { ok: false, error: direct };
    if (direct) {
      return { ok: true, body: direct as PerformanceThresholds };
    }
  }

  const legacyStudent = parseThresholdGroup(raw.student);
  if (typeof legacyStudent === "string") {
    return { ok: false, error: legacyStudent };
  }
  if (legacyStudent) {
    return { ok: true, body: legacyStudent as PerformanceThresholds };
  }

  const legacyStandard = parseThresholdGroup(raw.standard);
  if (typeof legacyStandard === "string") {
    return { ok: false, error: legacyStandard };
  }
  if (legacyStandard) {
    return { ok: true, body: legacyStandard as PerformanceThresholds };
  }

  return { ok: false, error: "Missing thresholds." };
}
