"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Download, Search, Timer } from "lucide-react";
import { StudentAvatar } from "@/components/StudentAvatar";
import {
  filterAssignmentProgressRowsByQuery,
  sortAssignmentProgressRows,
  type AssignmentProgressResponse,
  type AssignmentProgressRowSortKey,
  type AssignmentProgressStatus,
  type AssignmentProgressSummary,
  type StudentAssignmentProgress,
} from "@/lib/analytics/assignment-progress";
import { downloadAssignmentProgressCsv } from "@/lib/csv/assignment-progress";
import {
  badgeAmber,
  badgeEmerald,
  badgeRose,
  barAmber,
  barEmerald,
  barRose,
  textAmber,
  textEmerald,
  textRose,
} from "@/lib/ui/status-badge-styles";

const SORT_OPTIONS: { value: AssignmentProgressRowSortKey; label: string }[] = [
  {
    value: "needs_attention",
    label: "Needs attention (most not started, then lowest % done)",
  },
  {
    value: "highest_completion_first",
    label: "Highest % complete first",
  },
  { value: "student_id_asc", label: "Student ID (A–Z)" },
  { value: "student_id_desc", label: "Student ID (Z–A)" },
];

type AssignmentProgressPanelProps = {
  data: AssignmentProgressResponse;
  isLoading: boolean;
  className?: string;
  /** Set when the progress API failed; avoids showing a misleading empty matrix. */
  errorMessage?: string | null;
};

export function AssignmentProgressPanel({
  data,
  isLoading,
  className = "",
  errorMessage = null,
}: AssignmentProgressPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] =
    useState<AssignmentProgressRowSortKey>("student_id_asc");
  const hasAssignments = data.assignments.length > 0;
  const hasRows = data.rows.length > 0;

  const visibleRows = useMemo(() => {
    const filtered = filterAssignmentProgressRowsByQuery(data.rows, searchQuery);
    return sortAssignmentProgressRows(filtered, sortKey);
  }, [data.rows, searchQuery, sortKey]);

  const totalTargets = data.assignments.reduce(
    (sum, a) => sum + a.totalTargets,
    0,
  );
  const totals = data.assignments.reduce(
    (acc, a) => {
      acc.completed += a.completedCount;
      acc.inProgress += a.inProgressCount;
      acc.notStarted += a.notStartedCount;
      return acc;
    },
    { completed: 0, inProgress: 0, notStarted: 0 },
  );

  return (
    <section
      className={`rounded-2xl border border-border-default bg-surface shadow-sm ${className}`.trim()}
    >
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-gray">Assignment progress</h2>
        <p className="text-xs text-muted-foreground">
          Search by name or student ID. Needs attention: most &quot;not
          started&quot; cells first, then lowest share complete. Highest %
          complete: best overall progress (completed ÷ assigned in this table).
          Or sort by student ID.
        </p>
      </div>

      {errorMessage && !isLoading ? (
        <p className="mx-5 mt-3 rounded-lg border border-error-border bg-error-light px-3 py-2 text-sm text-error">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Loading assignment progress...
        </p>
      ) : errorMessage ? null : !hasAssignments ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          No assignments found for the current school filter.
        </p>
      ) : !hasRows ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          No students in the selected school(s).
        </p>
      ) : (
        <>
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
            <ProgressTotalCard
              label="Completed"
              value={totals.completed}
              total={totalTargets}
              tone="emerald"
            />
            <ProgressTotalCard
              label="In progress"
              value={totals.inProgress}
              total={totalTargets}
              tone="amber"
            />
            <ProgressTotalCard
              label="Not started"
              value={totals.notStarted}
              total={totalTargets}
              tone="rose"
            />
          </div>
          <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm text-slate-gray">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Search
              </span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name or student ID"
                  className="w-full rounded-lg border border-border-default bg-surface py-2 pl-9 pr-3 text-sm text-slate-gray placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  autoComplete="off"
                />
              </span>
            </label>
            <label className="w-full text-sm text-slate-gray sm:w-[min(100%,22rem)] sm:flex-none">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sort rows
              </span>
              <select
                value={sortKey}
                onChange={(e) =>
                  setSortKey(e.target.value as AssignmentProgressRowSortKey)
                }
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-slate-gray focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => downloadAssignmentProgressCsv(data, visibleRows)}
              disabled={visibleRows.length === 0}
              className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-primary px-3 text-sm font-medium text-forest transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border-default disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-surface-muted/90 px-5 py-3">
                    Student
                  </th>
                  {data.assignments.map((a) => (
                    <th
                      key={a.assignmentId}
                      className="px-3 py-3 text-center font-semibold"
                    >
                      <AssignmentHeaderCell assignment={a} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={data.assignments.length + 1}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      {searchQuery.trim()
                        ? "No students match your search."
                        : "No students to show."}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => (
                    <tr
                      key={row.studentId}
                      className="border-t border-border-subtle hover:bg-surface-muted/40"
                    >
                      <td className="sticky left-0 z-10 bg-surface px-5 py-3 hover:bg-surface-muted/40">
                        <div className="flex items-center gap-3">
                          <StudentAvatar label={row.label} />
                          <div className="min-w-[140px]">
                            <p className="font-medium text-slate-gray truncate">
                              {row.label}
                            </p>
                            {row.studentIdCode &&
                            row.studentIdCode.trim().toLowerCase() !==
                              row.label.trim().toLowerCase() ? (
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {row.studentIdCode}
                              </p>
                            ) : null}
                            <p className="text-[11px] text-muted-foreground">
                              {row.completedCount}/
                              {row.completedCount +
                                row.inProgressCount +
                                row.notStartedCount}{" "}
                              completed
                            </p>
                          </div>
                        </div>
                      </td>
                      {data.assignments.map((a) => {
                        const progress = row.progress[a.assignmentId];
                        return (
                          <td
                            key={a.assignmentId}
                            className="px-3 py-3 text-center"
                          >
                            <ProgressStatusCell progress={progress} />
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function AssignmentHeaderCell({
  assignment,
}: {
  assignment: AssignmentProgressSummary;
}) {
  const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
  const dueLabel =
    dueDate && !Number.isNaN(dueDate.getTime())
      ? dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : null;
  const completionPct =
    assignment.totalTargets > 0
      ? Math.round((assignment.completedCount / assignment.totalTargets) * 100)
      : 0;
  return (
    <div
      className="flex flex-col items-center gap-1 text-slate-gray"
      title={assignment.title}
    >
      <span className="max-w-[160px] truncate text-xs font-semibold normal-case">
        {assignment.title}
      </span>
      <span className="text-[10px] font-normal text-muted-foreground">
        {dueLabel ? `Due ${dueLabel}` : "No due date"}
      </span>
      <span className={`text-[10px] font-normal ${textEmerald}`}>
        {assignment.completedCount}/{assignment.totalTargets} ({completionPct}%)
      </span>
    </div>
  );
}

function ProgressStatusCell({
  progress,
}: {
  progress: StudentAssignmentProgress | undefined;
}) {
  if (!progress) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        title="Not assigned to this student"
      >
        —
      </span>
    );
  }
  const tone: Record<AssignmentProgressStatus, string> = {
    completed: badgeEmerald,
    in_progress: badgeAmber,
    not_started: badgeRose,
  };
  const icon: Record<AssignmentProgressStatus, ReactNode> = {
    completed: <CheckCircle2 className="h-3 w-3" />,
    in_progress: <Timer className="h-3 w-3" />,
    not_started: <AlertCircle className="h-3 w-3" />,
  };
  const label: Record<AssignmentProgressStatus, string> = {
    completed: "Completed",
    in_progress: "In progress",
    not_started: "Not started",
  };
  const title = buildProgressCellTitle(progress);
  const hasCompletedScore =
    progress.status === "completed" &&
    progress.correctCount != null &&
    progress.scoredTotal != null &&
    progress.scorePercent != null;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone[progress.status]}`}
      title={title}
    >
      {icon[progress.status]}
      {label[progress.status]}
      {progress.status === "in_progress" && progress.totalQuestions != null && (
        <span className={`ml-0.5 text-[10px] font-normal ${textAmber} opacity-80`}>
          {progress.answeredCount}/{progress.totalQuestions}
        </span>
      )}
      {hasCompletedScore && (
        <span className={`ml-0.5 text-[10px] font-normal ${textEmerald} opacity-80`}>
          {progress.correctCount}/{progress.scoredTotal} ({progress.scorePercent}%)
        </span>
      )}
    </span>
  );
}

function buildProgressCellTitle(progress: StudentAssignmentProgress): string {
  const parts: string[] = [];
  if (progress.status === "completed") {
    if (progress.lastCompletedAt) {
      parts.push(
        `Completed ${new Date(progress.lastCompletedAt).toLocaleString()}`,
      );
    } else {
      parts.push("Completed");
    }
    if (
      progress.correctCount != null &&
      progress.scoredTotal != null &&
      progress.scorePercent != null
    ) {
      parts.push(
        `Score ${progress.correctCount}/${progress.scoredTotal} (${progress.scorePercent}%)`,
      );
    }
  } else if (progress.status === "in_progress") {
    if (progress.totalQuestions != null) {
      parts.push(
        `Answered ${progress.answeredCount} of ${progress.totalQuestions}`,
      );
    } else {
      parts.push(`Answered ${progress.answeredCount}`);
    }
  } else {
    parts.push("Not started yet");
  }
  return parts.join(" · ");
}

function ProgressTotalCard({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const barTone: Record<"emerald" | "amber" | "rose", string> = {
    emerald: barEmerald,
    amber: barAmber,
    rose: barRose,
  };
  const textTone: Record<"emerald" | "amber" | "rose", string> = {
    emerald: textEmerald,
    amber: textAmber,
    rose: textRose,
  };
  return (
    <div className="rounded-xl border border-border-default bg-surface-muted p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${textTone[tone]}`}>{value}</span>
        <span className="text-xs text-muted-foreground">of {total}</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full ${barTone[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
