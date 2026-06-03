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

/** Lower-bound (inclusive) of the Advanced band for a single student. */
export const STUDENT_ADVANCED_MIN_ACCURACY = 85;
/** Lower-bound (inclusive) of the Proficient band for a single student. */
export const STUDENT_PROFICIENT_MIN_ACCURACY = 70;
/** Lower-bound (inclusive) of the Basic band for a single student. Below this is "below basic". */
export const STUDENT_BASIC_MIN_ACCURACY = 50;

/** Lower-bound (inclusive) of the Advanced band for a standard rollup. */
export const STANDARD_ADVANCED_MIN_ACCURACY = 85;
/** Lower-bound (inclusive) of the Proficient band for a standard rollup. */
export const STANDARD_PROFICIENT_MIN_ACCURACY = 70;
/** Lower-bound (inclusive) of the Basic band for a standard rollup. Below this is "below basic". */
export const STANDARD_BASIC_MIN_ACCURACY = 50;

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
  student: {
    advancedMin: number;
    proficientMin: number;
    basicMin: number;
  };
  standard: {
    advancedMin: number;
    proficientMin: number;
    basicMin: number;
  };
}

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  student: {
    advancedMin: STUDENT_ADVANCED_MIN_ACCURACY,
    proficientMin: STUDENT_PROFICIENT_MIN_ACCURACY,
    basicMin: STUDENT_BASIC_MIN_ACCURACY,
  },
  standard: {
    advancedMin: STANDARD_ADVANCED_MIN_ACCURACY,
    proficientMin: STANDARD_PROFICIENT_MIN_ACCURACY,
    basicMin: STANDARD_BASIC_MIN_ACCURACY,
  },
};

/**
 * Merge user-supplied (potentially partial) thresholds on top of the
 * defaults and clamp every value to [0, 100]. Returns a fully-populated
 * `PerformanceThresholds`. Out-of-order values are not auto-corrected
 * here; the API layer is responsible for rejecting invalid input.
 */
export function resolvePerformanceThresholds(
  override: Partial<{
    student: Partial<PerformanceThresholds["student"]>;
    standard: Partial<PerformanceThresholds["standard"]>;
  }> | null,
): PerformanceThresholds {
  const clamp = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, Math.round(value)));
  };
  const studentDefaults = DEFAULT_PERFORMANCE_THRESHOLDS.student;
  const sharedOverride = override?.student ?? override?.standard;
  const sharedThresholds = {
    advancedMin: clamp(
      sharedOverride?.advancedMin ?? studentDefaults.advancedMin,
      studentDefaults.advancedMin,
    ),
    proficientMin: clamp(
      sharedOverride?.proficientMin ?? studentDefaults.proficientMin,
      studentDefaults.proficientMin,
    ),
    basicMin: clamp(
      sharedOverride?.basicMin ?? studentDefaults.basicMin,
      studentDefaults.basicMin,
    ),
  };
  return {
    student: { ...sharedThresholds },
    standard: { ...sharedThresholds },
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
  const groups: { scope: "student" | "standard"; values: PerformanceThresholds["student"] }[] = [
    { scope: "student", values: thresholds.student },
    { scope: "standard", values: thresholds.standard },
  ];
  for (const { scope, values } of groups) {
    const { basicMin, proficientMin, advancedMin } = values;
    for (const [name, v] of [
      ["basic", basicMin],
      ["proficient", proficientMin],
      ["advanced", advancedMin],
    ] as const) {
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return `${scope} ${name} threshold must be between 0 and 100.`;
      }
    }
    if (!(basicMin <= proficientMin && proficientMin <= advancedMin)) {
      return `${scope} thresholds must satisfy basic ≤ proficient ≤ advanced.`;
    }
  }
  return null;
}
