import Link from "next/link";
import type { ReactNode } from "react";
import { Calendar, ClipboardList } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import {
  estimateQuestionCount,
  getAssignmentModeMeta,
  isAssignmentOverdue,
} from "@/components/assignments/assignment-design";
import { buildPracticeHref } from "@/components/assignments/AssignmentRow";
import { RingProgress } from "@/components/home/RingProgress";

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

/** Same absolute date as formatDueDateTime, without the year (this row is a
 * compact list — the year is implied and the space is needed elsewhere). */
function formatDueShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, { timeStyle: "short" });
  if (isToday) return `Today, ${time}`;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

const METADATA_GRID_COLS =
  "grid-cols-[56px_1fr_auto] sm:grid-cols-[72px_minmax(240px,1fr)_96px_100px_minmax(170px,190px)_128px]";

function MetaColumn({ children }: { children: ReactNode }) {
  return <div className="hidden flex-col items-start gap-0.5 sm:flex">{children}</div>;
}

function CompactAssignmentCard({
  assignment,
}: {
  assignment: StudentAssignmentListItem;
}) {
  const href = buildPracticeHref(assignment);
  const overdue = isAssignmentOverdue(assignment);
  const { Icon, color, label, pillBg, pillBorder } = getAssignmentModeMeta(
    assignment.mode,
  );
  const ctaLabel = assignment.status === "in_progress" ? "Continue" : "Start";
  const questionCount =
    assignment.progress.total > 0
      ? assignment.progress.total
      : (assignment.max_questions ??
        estimateQuestionCount(assignment.target_minutes));
  const progressRatio =
    assignment.progress.total > 0
      ? assignment.progress.answered / assignment.progress.total
      : null;

  return (
    <div
      className={`grid items-center gap-3 rounded-2xl p-4 sm:items-start sm:gap-x-[18px] sm:p-5 ${METADATA_GRID_COLS}`}
      style={{
        background: "var(--assignment-glass-bg)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-card-shadow)",
        backdropFilter: "blur(14px) saturate(115%)",
        WebkitBackdropFilter: "blur(14px) saturate(115%)",
      }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center justify-self-start rounded-2xl sm:self-center"
        style={{ background: pillBg }}
      >
        <Icon style={{ width: 20, height: 20, color }} aria-hidden="true" />
      </div>

      <div className="min-w-0">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5"
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            fontWeight: 500,
            fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            color,
            background: pillBg,
            border: `1.5px solid ${pillBorder}`,
          }}
        >
          {label}
        </span>
        <p
          className="mt-1 truncate text-slate-gray"
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: -0.3,
            fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
          }}
        >
          {assignment.title}
        </p>
      </div>

      <MetaColumn>
        <span className="text-[10px] text-muted-foreground">Questions</span>
        <span className="text-sm font-semibold text-slate-gray">{questionCount}</span>
      </MetaColumn>

      <MetaColumn>
        <span className="text-[10px] text-muted-foreground">Progress</span>
        {progressRatio !== null ? (
          <RingProgress ratio={progressRatio} size={30} strokeWidth={4}>
            <span className="text-[10px] font-semibold text-slate-gray">
              {Math.round(progressRatio * 100)}%
            </span>
          </RingProgress>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </MetaColumn>

      <MetaColumn>
        <span className="text-[10px] text-muted-foreground">Due</span>
        {assignment.due_date ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium"
            style={{
              color: overdue ? "var(--assignment-overdue)" : "var(--foreground)",
            }}
          >
            <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} aria-hidden="true" />
            {formatDueShort(assignment.due_date)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </MetaColumn>

      <Link
        href={href}
        className="inline-flex h-10 w-20 flex-shrink-0 items-center justify-center justify-self-start rounded-full font-bold transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)] sm:self-center"
        style={{
          fontSize: 13,
          letterSpacing: "0.2px",
          fontWeight: 700,
          fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
          color: "var(--assignment-row-cta-text)",
          background: "var(--assignment-row-cta-bg)",
          border: "1.5px solid var(--assignment-row-cta-border)",
          boxShadow: "var(--assignment-row-cta-shadow)",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

export function QuickStartAssignments({
  assignments,
  showHeader = true,
}: {
  assignments: StudentAssignmentListItem[];
  showHeader?: boolean;
}) {
  const upcoming = selectUpcomingAssignments(assignments);

  return (
    <div className="flex flex-col gap-3">
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <h2
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--muted-foreground)" }}
          >
            Upcoming assignments
          </h2>
          <Link
            href="/assignments"
            className="text-sm font-semibold transition hover:brightness-110"
            style={{ color: "var(--assignment-completed)" }}
          >
            See all assignments →
          </Link>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div
          className="flex items-center gap-3 rounded-2xl p-4 text-sm text-muted-foreground"
          style={{
            background: "var(--assignment-glass-bg)",
            border: "1px solid var(--assignment-glass-border)",
          }}
        >
          <ClipboardList className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          {assignments.length === 0
            ? "No active assignments right now."
            : "All caught up! No pending assignments."}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {upcoming.map((assignment) => (
            <CompactAssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </div>
  );
}
