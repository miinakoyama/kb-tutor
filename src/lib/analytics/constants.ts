/**
 * Shared thresholds for classifying student / standard performance
 * and detecting low-engagement ("clicking without engaging") patterns.
 *
 * Centralizing these values makes it easy for product to adjust the
 * default cutoffs without hunting through aggregation code. Teachers
 * can also override these defaults from the Teacher Dashboard; per-user
 * overrides are stored in `teacher_performance_thresholds` and merged
 * on top of the defaults at request time.
 *
 * Bands align with the Pennsylvania Keystone Biology performance
 * levels: Below Basic, Basic, Proficient, Advanced. See
 * `docs/performance-bands.md` for the full definitions and formulas.
 */

/** Lower-bound (inclusive) of the Advanced band. */
export const ADVANCED_MIN_ACCURACY = 85;
/** Lower-bound (inclusive) of the Proficient band. */
export const PROFICIENT_MIN_ACCURACY = 70;
/** Lower-bound (inclusive) of the Basic band. Below this is "below basic". */
export const BASIC_MIN_ACCURACY = 50;

/**
 * "Low + fast" (a.k.a. clicking-without-engaging) thresholds.
 * A student is flagged only when ALL of the following hold:
 *  - attempted at least LOW_AND_FAST_MIN_ATTEMPTS questions (avoids noise)
 *  - accuracy is below LOW_AND_FAST_MAX_ACCURACY
 *  - average time per question is below LOW_AND_FAST_MAX_AVG_TIME_SEC
 */
export const LOW_AND_FAST_MIN_ATTEMPTS = 10;
export const LOW_AND_FAST_MAX_ACCURACY = 50;
export const LOW_AND_FAST_MAX_AVG_TIME_SEC = 30;

/**
 * Default thresholds bundle. The shape mirrors the per-teacher overrides
 * stored in the DB so callers can do a single merge and pass the result
 * to the classifier.
 */
export interface PerformanceThresholds {
  advancedMin: number;
  proficientMin: number;
  basicMin: number;
}

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  advancedMin: ADVANCED_MIN_ACCURACY,
  proficientMin: PROFICIENT_MIN_ACCURACY,
  basicMin: BASIC_MIN_ACCURACY,
};

export function isDefaultPerformanceThresholds(
  thresholds: PerformanceThresholds,
): boolean {
  return (
    thresholds.basicMin === DEFAULT_PERFORMANCE_THRESHOLDS.basicMin
    && thresholds.proficientMin === DEFAULT_PERFORMANCE_THRESHOLDS.proficientMin
    && thresholds.advancedMin === DEFAULT_PERFORMANCE_THRESHOLDS.advancedMin
  );
}

/**
 * defaults and clamp every value to [0, 100]. Returns a fully-populated
 * `PerformanceThresholds`. Out-of-order values are not auto-corrected
 * here; the API layer is responsible for rejecting invalid input.
 */
export function resolvePerformanceThresholds(
  override: Partial<PerformanceThresholds> | null,
): PerformanceThresholds {
  const clamp = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, Math.round(value)));
  };

  const defaults = DEFAULT_PERFORMANCE_THRESHOLDS;
  return {
    advancedMin: clamp(
      override?.advancedMin ?? defaults.advancedMin,
      defaults.advancedMin,
    ),
    proficientMin: clamp(
      override?.proficientMin ?? defaults.proficientMin,
      defaults.proficientMin,
    ),
    basicMin: clamp(
      override?.basicMin ?? defaults.basicMin,
      defaults.basicMin,
    ),
  };
}

/**
 * Validate that bands are monotonically non-decreasing and within
 * [0, 100]. Returns the first violation as a human-readable message, or
 * `null` when the bundle is valid.
 */
export function validatePerformanceThresholds(
  thresholds: PerformanceThresholds,
): string | null {
  const { basicMin, proficientMin, advancedMin } = thresholds;
  for (const [name, value] of [
    ["basic", basicMin],
    ["proficient", proficientMin],
    ["advanced", advancedMin],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return `${name} threshold must be between 0 and 100.`;
    }
  }
  if (!(basicMin <= proficientMin && proficientMin <= advancedMin)) {
    return "Thresholds must satisfy basic ≤ proficient ≤ advanced.";
  }
  return null;
}
