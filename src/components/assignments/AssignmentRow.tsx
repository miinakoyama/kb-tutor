"use client";

import Link from "next/link";
import { Clock, GraduationCap, NotebookPen, RotateCcw } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { formatDueDateTime } from "@/lib/due-date";

function estimateQuestionCount(targetMinutes: number): number {
  return Math.max(6, Math.min(40, Math.round(targetMinutes / 1.8)));
}

function buildPracticeHref(assignment: StudentAssignmentListItem): string {
  const questionCount =
    assignment.max_questions ?? estimateQuestionCount(assignment.target_minutes);
  const params = new URLSearchParams({
    mode: assignment.mode,
    assignmentId: assignment.id,
    questions: String(questionCount),
    topics: assignment.topics.join(","),
  });
  return `/practice?${params.toString()}`;
}

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const t = new Date(dueDate).getTime();
  return Number.isFinite(t) && t < Date.now();
}

const MODE_ICON: Record<
  "practice" | "exam" | "review",
  { Icon: typeof NotebookPen; color: string }
> = {
  practice: { Icon: NotebookPen, color: "var(--color-sky-600, #0284c7)" },
  exam: { Icon: GraduationCap, color: "var(--color-orange-600, #ea580c)" },
  review: { Icon: RotateCcw, color: "var(--color-violet-600, #7c3aed)" },
};

export function AssignmentRow({
  assignment,
}: {
  assignment: StudentAssignmentListItem;
}) {
  const href = buildPracticeHref(assignment);
  const overdue = isOverdue(assignment.due_date);
  const { mode, progress, status } = assignment;
  const { Icon, color } = MODE_ICON[mode] ?? MODE_ICON.practice;

  const completionRatio =
    progress.total > 0 ? Math.min(1, progress.answered / progress.total) : 0;

  const totalLabel =
    mode === "review" ? `up to ${progress.total}` : String(progress.total);

  return (
    <Link
      href={href}
      className="group block rounded-xl border border-border-default bg-surface shadow-sm p-5 hover:border-foreground/30 hover:-translate-y-px transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {/* Mode icon */}
      <Icon
        className="mb-3 flex-shrink-0"
        style={{ width: 26, height: 26, color }}
        aria-hidden="true"
      />

      {/* Title — 2 lines max */}
      <p
        className="font-medium text-slate-gray mb-3 line-clamp-2 leading-snug"
        style={{ fontSize: 15 }}
      >
        {assignment.title}
      </p>

      {/* Progress section */}
      <div className="mb-3">
        {status === "not_started" ? (
          progress.total > 0 ? (
            <p className="text-xs text-muted-foreground">
              {totalLabel} questions
            </p>
          ) : null
        ) : (
          progress.total > 0 && (
            <>
              <div
                className="rounded-full overflow-hidden mb-1"
                style={{
                  height: 3,
                  background: "var(--surface-muted)",
                }}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${completionRatio * 100}%`,
                    background: "var(--primary)",
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {progress.answered} of {totalLabel}
              </p>
            </>
          )
        )}
      </div>

      {/* Due date */}
      <p
        className="text-xs inline-flex items-center gap-1"
        style={{
          color: overdue ? "var(--error-color)" : "var(--muted-foreground)",
        }}
      >
        {overdue && (
          <Clock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        )}
        {assignment.due_date
          ? formatDueDateTime(assignment.due_date)
          : "No due date"}
      </p>
    </Link>
  );
}
