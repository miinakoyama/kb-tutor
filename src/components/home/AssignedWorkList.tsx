import Link from "next/link";
import { ClipboardList } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { formatDueRelative, isDueUrgent } from "@/lib/due-date";
import { buildPracticeHref } from "@/components/assignments/AssignmentRow";

const UPCOMING_LIMIT = 3;

function dueDateSortKey(assignment: StudentAssignmentListItem): number {
  if (!assignment.due_date) return Number.POSITIVE_INFINITY;
  const time = new Date(assignment.due_date).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** The three incomplete assignments with the nearest due dates, ascending. */
export function selectUpcomingAssignments(
  assignments: StudentAssignmentListItem[],
): StudentAssignmentListItem[] {
  return assignments
    .filter((assignment) => assignment.status !== "completed")
    .sort((a, b) => dueDateSortKey(a) - dueDateSortKey(b))
    .slice(0, UPCOMING_LIMIT);
}

function AssignedWorkRow({ assignment }: { assignment: StudentAssignmentListItem }) {
  const href = buildPracticeHref(assignment);
  const started =
    assignment.status === "in_progress" && assignment.progress.total > 0;
  const progressRatio = started
    ? assignment.progress.answered / assignment.progress.total
    : null;
  const dueLabel = formatDueRelative(assignment.due_date);
  const urgent = isDueUrgent(assignment.due_date);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_96px] sm:gap-x-6">
      <div className="min-w-0">
        <p
          className="truncate font-semibold text-slate-gray"
          style={{
            fontSize: 15,
            letterSpacing: -0.3,
            fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
          }}
        >
          {assignment.title}
        </p>
        {dueLabel && (
          <p
            className="mt-0.5 text-xs"
            style={{
              color: urgent ? "var(--assignment-overdue)" : "var(--muted-foreground)",
            }}
          >
            {dueLabel}
          </p>
        )}
      </div>

      <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
        {progressRatio !== null ? (
          <>
            <div
              className="h-2 flex-1 overflow-hidden rounded-full"
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border-default)",
              }}
              role="progressbar"
              aria-valuenow={Math.round(progressRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${assignment.title} progress`}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round(progressRatio * 100)}%`,
                  background: "var(--assignment-progress-fill)",
                }}
              />
            </div>
            <span className="w-9 flex-shrink-0 text-right text-xs font-semibold text-slate-gray">
              {Math.round(progressRatio * 100)}%
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Not started</span>
        )}
      </div>

      <Link
        href={href}
        className="justify-self-end text-sm font-semibold transition hover:brightness-110"
        style={{ color: "var(--assignment-completed)" }}
      >
        {assignment.status === "in_progress" ? "Continue" : "Start"} →
      </Link>
    </div>
  );
}

export function AssignedWorkList({
  assignments,
}: {
  assignments: StudentAssignmentListItem[];
}) {
  const upcoming = selectUpcomingAssignments(assignments);

  if (upcoming.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl p-4 text-sm text-muted-foreground"
        style={{
          background: "var(--assignment-glass-bg)",
          border: "1px solid var(--assignment-glass-border)",
          boxShadow: "var(--assignment-card-shadow)",
        }}
      >
        <ClipboardList className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        {assignments.length === 0
          ? "No active assignments right now."
          : "All caught up! No pending assignments."}
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {upcoming.map((assignment) => (
        <AssignedWorkRow key={assignment.id} assignment={assignment} />
      ))}
    </div>
  );
}
