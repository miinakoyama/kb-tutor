"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Play,
  RotateCcw,
  Clock,
} from "lucide-react";
import type {
  StudentAssignmentListItem,
  StudentAssignmentStatus,
} from "@/lib/student-assignments";

interface StudentAssignmentsListProps {
  assignments: StudentAssignmentListItem[];
  loadError: string | null;
}

type TabKey = "active" | "completed";

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
  const [tab, setTab] = useState<TabKey>("active");

  const partitioned = useMemo(() => {
    const active: StudentAssignmentListItem[] = [];
    const completed: StudentAssignmentListItem[] = [];
    for (const a of assignments) {
      if (a.status === "completed") completed.push(a);
      else active.push(a);
    }
    active.sort((a, b) => dueDateSortKey(a) - dueDateSortKey(b));
    completed.sort((a, b) => {
      const aT = a.last_completed_at
        ? new Date(a.last_completed_at).getTime()
        : 0;
      const bT = b.last_completed_at
        ? new Date(b.last_completed_at).getTime()
        : 0;
      return bT - aT;
    });
    return { active, completed };
  }, [assignments]);

  const visibleList =
    tab === "active" ? partitioned.active : partitioned.completed;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          My Assignments
        </h1>
        <p className="text-slate-gray/70">
          Complete teacher-assigned practice with guided hints after misses.
        </p>
      </section>

      {loadError && (
        <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">
            Failed to load assignments. Please refresh and try again.
          </p>
        </section>
      )}

      <div
        role="tablist"
        aria-label="Assignment status"
        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 mb-4"
      >
        <TabButton
          active={tab === "active"}
          label="Active"
          count={partitioned.active.length}
          onClick={() => setTab("active")}
        />
        <TabButton
          active={tab === "completed"}
          label="Completed"
          count={partitioned.completed.length}
          onClick={() => setTab("completed")}
        />
      </div>

      {visibleList.length === 0 ? (
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm">
          <p className="text-slate-gray">
            {tab === "active"
              ? "No active assignments right now."
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
          ? "bg-white text-[#14532d] shadow-sm"
          : "text-slate-gray/70 hover:text-slate-gray"
      }`}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
          active
            ? "bg-[#16a34a]/10 text-[#14532d]"
            : "bg-slate-200 text-slate-gray/70"
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
  const ctaLabel = ctaLabelFor(assignment.status);
  const CtaIcon =
    assignment.status === "completed"
      ? RotateCcw
      : assignment.status === "in_progress"
        ? Play
        : Play;

  return (
    <article className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16a34a] bg-[#16a34a]/10 px-2 py-1 rounded-full">
              <ClipboardList className="w-3.5 h-3.5" />
              Assignment
            </span>
            <StatusBadge status={assignment.status} />
            {overdue && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-1 rounded-full">
                <Clock className="w-3 h-3" />
                Overdue
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-slate-gray">
            {assignment.title}
          </h2>
          <p className="text-sm text-slate-gray/70 mt-1">
            Topics: {assignment.topics.slice(0, 3).join(", ")}
            {assignment.topics.length > 3
              ? ` +${assignment.topics.length - 3} more`
              : ""}
          </p>

          <ProgressRow assignment={assignment} />

          {assignment.status === "completed" && assignment.last_completed_at ? (
            <p className="text-xs text-slate-gray/60 mt-2 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a]" />
              Completed{" "}
              {new Date(assignment.last_completed_at).toLocaleDateString()}
            </p>
          ) : assignment.due_date ? (
            <p
              className={`text-xs mt-2 inline-flex items-center gap-1.5 ${
                overdue ? "text-red-700" : "text-slate-gray/60"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Due {new Date(assignment.due_date).toLocaleDateString()}
            </p>
          ) : (
            <p className="text-xs text-slate-gray/50 mt-2">No due date</p>
          )}
        </div>

        <Link
          href={href}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#16a34a] text-white text-sm font-medium hover:bg-[#15803d] transition-colors"
        >
          <CtaIcon className="w-4 h-4" />
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: StudentAssignmentStatus }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#14532d] bg-[#16a34a]/15 px-2 py-1 rounded-full">
        <CheckCircle2 className="w-3 h-3" />
        Completed
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-1 rounded-full">
        In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-gray bg-slate-100 px-2 py-1 rounded-full">
      Not started
    </span>
  );
}

function ctaLabelFor(status: StudentAssignmentStatus): string {
  if (status === "completed") return "Restart";
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
      <div className="flex items-center justify-between text-xs text-slate-gray/70">
        <span>
          {progress.answered} of {totalLabel} answered
        </span>
        {progress.answered > 0 && (
          <span className="text-[#14532d] font-medium">
            {Math.round(ratio * 100)}%
          </span>
        )}
      </div>
      <div
        className="h-1.5 rounded-full bg-slate-100 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="h-full bg-[#16a34a] transition-all"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
