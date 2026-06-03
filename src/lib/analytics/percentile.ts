/**
 * Approximate percentile for a non-empty array of numeric samples.
 *
 * Uses nearest-rank: the value at index `floor((n-1) * ratio)` of the
 * sorted samples. Matches the original implementation in
 * `src/app/api/admin/analytics/questions/route.ts` so admin and teacher
 * analytics surfaces report the same numbers.
 */
export function percentile(
  values: readonly number[],
  ratio: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const index = Math.floor((sorted.length - 1) * clampedRatio);
  return sorted[index] ?? null;
}
