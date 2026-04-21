/**
 * Shared thresholds for classifying student / standard performance
 * and detecting low-engagement ("clicking without engaging") patterns.
 *
 * Centralizing these values makes it easy for product to adjust the
 * cutoffs without hunting through aggregation code.
 */

/** Minimum accuracy (%) to be classified as "on track". */
export const STUDENT_ON_TRACK_MIN_ACCURACY = 70;

/** Minimum accuracy (%) to be classified as "watch" (below on_track). */
export const STUDENT_WATCH_MIN_ACCURACY = 50;

/** Minimum accuracy (%) for a standard to be classified as "on track". */
export const STANDARD_ON_TRACK_MIN_ACCURACY = 70;

/** Minimum accuracy (%) for a standard to be classified as "watch". */
export const STANDARD_WATCH_MIN_ACCURACY = 55;

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
