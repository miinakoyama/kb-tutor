/**
 * Resolve standard counts when hydrating mass-production settings from storage.
 *
 * Saved drafts (pending all-zero or partial sums) must be preserved. Auto-distribute
 * only when older localStorage entries never persisted `standardCounts`.
 */
export function resolveHydratedStandardCounts(options: {
  selectedStandardIds: string[];
  normalizedCounts: Record<string, number>;
  totalTarget: number;
  hasSavedStandardCounts: boolean;
  distribute: (
    standardIds: string[],
    questionCount: number,
  ) => Record<string, number>;
}): Record<string, number> {
  const {
    selectedStandardIds,
    normalizedCounts,
    totalTarget,
    hasSavedStandardCounts,
    distribute,
  } = options;

  if (hasSavedStandardCounts) {
    return normalizedCounts;
  }

  const assignedTotal = Object.values(normalizedCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (assignedTotal === totalTarget) {
    return normalizedCounts;
  }

  return distribute(selectedStandardIds, totalTarget);
}
