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
  // Not-started assignments show an empty bar (0%), not a text label.
  const progressRatio = started
    ? assignment.progress.answered / assignment.progress.total
    : 0;
  const progressPercent = Math.round(progressRatio * 100);
  const dueLabel = formatDueRelative(assignment.due_date);
  const urgent = isDueUrgent(assignment.due_date);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[minmax(140px,0.6fr)_minmax(160px,1.6fr)_96px] sm:gap-x-6">
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

      <div className="col-span-2 flex items-center gap-3 sm:col-span-1 sm:max-w-[80%]">
        <div
          className="h-4 flex-1 overflow-hidden rounded-full"
          style={{
            background: "var(--surface-muted)",
            // Lighter than --border-subtle (0.1); same neutral ink the
            // design system's border tokens use.
            border: "1px solid rgb(31 45 31 / 0.05)",
          }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${assignment.title} progress`}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progressPercent}%`,
              background: "var(--assignment-progress-fill)",
            }}
          />
        </div>
        <span className="w-9 flex-shrink-0 text-right text-xs font-semibold text-slate-gray">
          {progressPercent}%
        </span>
      </div>

      <Link
        href={href}
        className="inline-flex h-8 w-24 items-center justify-center justify-self-end rounded-full text-xs font-semibold transition-colors hover:bg-[var(--assignment-row-cta-bg-hover)]"
        style={{
          color: "var(--assignment-row-cta-text)",
          background: "var(--assignment-row-cta-bg)",
          border: "1px solid var(--assignment-row-cta-border)",
          // Tighter than --assignment-row-cta-shadow's 0 4px 10px, same
          // neutral (no-green) shadow color the design system uses.
          boxShadow: "0 2px 5px rgb(38 37 31 / 0.10)",
        }}
      >
        {assignment.status === "in_progress" ? "Continue" : "Start"}
      </Link>
    </div>
  );
}

const CARD_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-card-shadow)",
} as const;

/**
 * Bento tile: heading, "View all" link, and the rows all live inside the
 * card — no text sits outside it.
 */
export function AssignedWorkList({
  assignments,
}: {
  assignments: StudentAssignmentListItem[];
}) {
  const upcoming = selectUpcomingAssignments(assignments);

  return (
    <section
      aria-labelledby="assigned-work-heading"
      className="flex flex-col rounded-[24px] p-5 sm:p-6"
      style={CARD_STYLE}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="assigned-work-heading" className="font-heading text-lg font-bold text-slate-gray">
          Assigned work
        </h2>
        <Link
          href="/assignments"
          className="text-sm font-semibold transition hover:brightness-110"
          style={{ color: "var(--assignment-completed)" }}
        >
          View all
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <ClipboardList className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          {assignments.length === 0
            ? "No active assignments right now."
            : "All caught up! No pending assignments."}
        </div>
      ) : (
        <div className="mt-1 flex flex-col divide-y divide-border-subtle">
          {upcoming.map((assignment) => (
            <AssignedWorkRow key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </section>
  );
}
