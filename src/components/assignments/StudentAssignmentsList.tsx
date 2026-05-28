"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  History,
  Play,
  RotateCcw,
  Clock,
  Info,
  Lock,
} from "lucide-react";
import type {
  StudentAssignmentListItem,
  StudentAssignmentStatus,
} from "@/lib/student-assignments";
import { formatDueDateTime } from "@/lib/due-date";
import { AssignmentModeBadge } from "@/components/assignments/AssignmentModeBadge";

interface StudentAssignmentsListProps {
  assignments: StudentAssignmentListItem[];
  loadError: string | null;
}

type TabKey = "incomplete" | "completed";

function estimateQuestionCount(targetMinutes: number): number {
  return Math.max(6, Math.min(40, Math.round(targetMinutes / 1.8)));
}

function buildPracticeHref(assignment: StudentAssignmentListItem): string {
  const questionCount =
    assignment.max_questions ?? estimateQuestionCount(assignment.target_minutes);
  // URLSearchParams handles the %-encoding of each value on toString(). Do NOT
  // pre-encode topics here (would double-encode and break decoding on the
  // receiving side in PracticePageClient).
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
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function dueDateSortKey(a: StudentAssignmentListItem): number {
  if (!a.due_date) return Number.POSITIVE_INFINITY;
  const t = new Date(a.due_date).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function StudentAssignmentsList({
  assignments,
  loadError,
}: StudentAssignmentsListProps) {
  const [tab, setTab] = useState<TabKey>("incomplete");

  const partitioned = useMemo(() => {
    const incomplete: StudentAssignmentListItem[] = [];
    const completed: StudentAssignmentListItem[] = [];
    for (const a of assignments) {
      if (a.status === "completed") completed.push(a);
      else incomplete.push(a);
    }
    incomplete.sort((a, b) => dueDateSortKey(a) - dueDateSortKey(b));
    completed.sort((a, b) => {
      const aT = a.last_completed_at
        ? new Date(a.last_completed_at).getTime()
        : 0;
      const bT = b.last_completed_at
        ? new Date(b.last_completed_at).getTime()
        : 0;
      return bT - aT;
    });
    return { incomplete, completed };
  }, [assignments]);

  const visibleList =
    tab === "incomplete" ? partitioned.incomplete : partitioned.completed;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-2">
          My Assignments
        </h1>
        <p className="text-muted-foreground">
          Complete teacher-assigned practice with guided hints after misses.
        </p>
      </section>

      {loadError && (
        <section className="rounded-lg border border-error-border bg-error-light px-4 py-3 mb-4">
          <p className="text-sm text-error">
            Failed to load assignments. Please refresh and try again.
          </p>
        </section>
      )}

      <div
        role="tablist"
        aria-label="Assignment status"
        className="inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1 mb-4"
      >
        <TabButton
          active={tab === "incomplete"}
          label="Incomplete"
          count={partitioned.incomplete.length}
          onClick={() => setTab("incomplete")}
        />
        <TabButton
          active={tab === "completed"}
          label="Completed"
          count={partitioned.completed.length}
          onClick={() => setTab("completed")}
        />
      </div>

      {visibleList.length === 0 ? (
        <section className="rounded-xl border border-primary/30 bg-surface p-6 shadow-sm">
          <p className="text-slate-gray">
            {tab === "incomplete"
              ? "No incomplete assignments right now."
              : "No completed assignments yet."}
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {visibleList.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </main>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-surface text-heading shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
          active
            ? "bg-primary/10 text-heading"
            : "bg-surface-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function AssignmentCard({
  assignment,
}: {
  assignment: StudentAssignmentListItem;
}) {
  const overdue =
    assignment.status !== "completed" && isOverdue(assignment.due_date);
  const href = buildPracticeHref(assignment);
  const historyHref = `/assignments/${encodeURIComponent(assignment.id)}/history`;

  // Retry is blocked once a student has finished `max_attempts` full runs.
  // While a run is in progress, Continue is always allowed even when at the
  // cap — the cap counts completed runs, not mid-flight ones.
  const attemptsCapped =
    assignment.max_attempts != null &&
    assignment.completed_attempts >= assignment.max_attempts;
  const isRestartBlocked =
    assignment.status === "completed" && attemptsCapped;

  const ctaLabel = ctaLabelFor(assignment.status);
  const CtaIcon =
    assignment.status === "completed"
      ? RotateCcw
      : assignment.status === "in_progress"
        ? Play
        : Play;

  return (
    <article className="rounded-2xl border border-border-default bg-surface p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <AssignmentModeBadge mode={assignment.mode} />
            <StatusBadge status={assignment.status} />
            {overdue && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-error bg-error-light px-2 py-1 rounded-full">
                <Clock className="w-3 h-3" />
                Overdue
              </span>
            )}
            <AttemptsBadge
              completedAttempts={assignment.completed_attempts}
              maxAttempts={assignment.max_attempts}
              status={assignment.status}
            />
          </div>
          <h2 className="text-lg font-semibold text-slate-gray">
            {assignment.title}
          </h2>
          {assignment.instructions && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2 dark:border-amber-500/25 dark:bg-amber-950/35">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0 dark:text-amber-400/80" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 mb-0.5 dark:text-amber-300/90">
                  Instructions
                </p>
                <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed dark:text-amber-100/80">
                  {assignment.instructions}
                </p>
              </div>
            </div>
          )}

          <ProgressRow assignment={assignment} />

          {assignment.status === "completed" && assignment.last_completed_at ? (
            <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              Completed{" "}
              {new Date(assignment.last_completed_at).toLocaleDateString()}
            </p>
          ) : assignment.due_date ? (
            <p
              className={`text-xs mt-2 inline-flex items-center gap-1.5 ${
                overdue ? "text-error" : "text-muted-foreground"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Due {formatDueDateTime(assignment.due_date)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">No due date</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full sm:w-[11.5rem] flex-shrink-0">
          {isRestartBlocked ? (
            <span
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 min-h-[44px] rounded-lg bg-surface-muted text-muted-foreground text-sm font-medium cursor-not-allowed"
              title={`You have used all ${assignment.max_attempts} attempts.`}
            >
              <Lock className="w-4 h-4 flex-shrink-0" />
              No retries left
            </span>
          ) : (
            <Link
              href={href}
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 min-h-[44px] rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors dark:shadow-none"
            >
              <CtaIcon className="w-4 h-4 flex-shrink-0" />
              {ctaLabel}
            </Link>
          )}
          {assignment.recorded_completion_count > 0 && (
            // Intentionally gated on `recorded_completion_count` (real
            // assignment_completions rows), NOT `completed_attempts`. The
            // latter can be synthesized to 1 for legacy completions that
            // pre-date the history table; clicking through in that case
            // would land on an empty history page.
            <Link
              href={historyHref}
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 min-h-[44px] rounded-lg border border-border-default text-slate-gray text-sm font-medium hover:bg-foreground/5 transition-colors"
            >
              <History className="w-4 h-4 flex-shrink-0" />
              Past attempts ({assignment.recorded_completion_count})
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function AttemptsBadge({
  completedAttempts,
  maxAttempts,
  status,
}: {
  completedAttempts: number;
  maxAttempts: number | null;
  status: StudentAssignmentStatus;
}) {
  // The "current attempt number" displayed to the student is the run they are
  // currently working on or about to start. Not-started/in-progress states
  // count the current run as `completed_attempts + 1`; completed shows the
  // last finished run.
  const currentAttempt =
    status === "completed" ? completedAttempts : completedAttempts + 1;
  if (maxAttempts == null) {
    if (completedAttempts === 0 && status !== "in_progress") {
      return null;
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-gray bg-surface-muted px-2 py-1 rounded-full">
        Attempt {currentAttempt} / ∞
      </span>
    );
  }
  const exhausted =
    status === "completed" && completedAttempts >= maxAttempts;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
        exhausted
          ? "bg-error-light text-error"
          : "bg-surface-muted text-slate-gray"
      }`}
    >
      Attempt {Math.min(currentAttempt, maxAttempts)} / {maxAttempts}
    </span>
  );
}

function StatusBadge({ status }: { status: StudentAssignmentStatus }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-forest bg-primary-light px-2 py-1 rounded-full">
        <CheckCircle2 className="w-3 h-3" />
        Completed
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-1 rounded-full dark:text-amber-200/90 dark:bg-amber-950/45 dark:ring-1 dark:ring-amber-700/30">
        In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-gray bg-surface-muted px-2 py-1 rounded-full">
      Not started
    </span>
  );
}

function ctaLabelFor(status: StudentAssignmentStatus): string {
  if (status === "completed") return "Retry";
  if (status === "in_progress") return "Continue";
  return "Start";
}

function ProgressRow({
  assignment,
}: {
  assignment: StudentAssignmentListItem;
}) {
  const { progress, mode, status } = assignment;

  // Completion is already communicated by the StatusBadge + "Completed <date>"
  // footer. The stored progress intentionally resets to 0/N on completion so
  // Restart can begin a fresh run without destroying history — rendering that
  // 0% bar contradicts the Completed badge, so we hide the bar entirely.
  if (status === "completed") return null;

  if (!progress.total) return null;
  const ratio =
    progress.total > 0 ? Math.min(1, progress.answered / progress.total) : 0;
  // Review is dynamic: the actual session size is min(max_questions, incorrect
  // questions in scope), but we only know the max up-front. Show `up to N` so
  // the denominator isn't misread as a hard promise.
  const totalLabel =
    mode === "review" ? `up to ${progress.total}` : String(progress.total);
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {progress.answered} of {totalLabel} answered
        </span>
        {progress.answered > 0 && (
          <span className="text-heading font-medium">
            {Math.round(ratio * 100)}%
          </span>
        )}
      </div>
      <div
        className="h-1.5 rounded-full bg-surface-muted overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
