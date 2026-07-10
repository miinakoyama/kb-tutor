import type {
  StudentAssignmentListItem,
  StudentAssignmentStatus,
} from "@/lib/student-assignments";

export type NextStepResult = {
  nextStep: StudentAssignmentListItem | null;
  others: StudentAssignmentListItem[];
};

function isOverdue(dueDate: string | null | undefined, now: Date): boolean {
  if (!dueDate) return false;
  const t = new Date(dueDate).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

function dueDateSortKey(dueDate: string | null | undefined): number {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  const t = new Date(dueDate).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

// Lower number = higher priority.
// Priority 1: in_progress, not overdue
// Priority 2: in_progress, overdue
// Priority 3: not_started, overdue
// Priority 4: not_started, not overdue
function priorityTier(
  status: StudentAssignmentStatus,
  overdue: boolean,
): number {
  if (status === "in_progress" && !overdue) return 0;
  if (status === "in_progress" && overdue) return 1;
  if (status === "not_started" && overdue) return 2;
  return 3;
}

/**
 * Selects the single highest-priority incomplete assignment as the "next step"
 * and returns the rest as `others`. Completed assignments are excluded entirely.
 *
 * Priority (first match wins):
 *   1. in_progress, not overdue  — earliest due date first
 *   2. in_progress, overdue      — earliest due date first
 *   3. not_started, overdue      — earliest due date first
 *   4. not_started, not overdue  — earliest due date first
 *
 * A missing or unparseable due date is treated as infinitely far in the future
 * (sorted last within its tier).
 *
 * `now` defaults to `new Date()` and is exposed for deterministic testing.
 */
export function selectNextStep(
  assignments: StudentAssignmentListItem[],
  now: Date = new Date(),
): NextStepResult {
  const incomplete = assignments.filter((a) => a.status !== "completed");

  if (incomplete.length === 0) {
    return { nextStep: null, others: [] };
  }

  const sorted = [...incomplete].sort((a, b) => {
    const aOverdue = isOverdue(a.due_date, now);
    const bOverdue = isOverdue(b.due_date, now);
    const tierDiff =
      priorityTier(a.status, aOverdue) - priorityTier(b.status, bOverdue);
    if (tierDiff !== 0) return tierDiff;
    return dueDateSortKey(a.due_date) - dueDateSortKey(b.due_date);
  });

  const [nextStep, ...others] = sorted;
  return { nextStep, others };
}
