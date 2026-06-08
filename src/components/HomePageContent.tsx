"use client";

import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flame,
  NotebookPen,
  Play,
} from "lucide-react";
import type {
  StudentAssignmentListItem,
  StudentAssignmentStatus,
} from "@/lib/student-assignments";
import { formatDueDateTime } from "@/lib/due-date";
import {
  daysUntilExam,
  formatExamDate,
  type KeystoneExamInfo,
} from "@/lib/keystone-exam";
import { AssignmentModeBadge } from "@/components/assignments/AssignmentModeBadge";
import { badgeAmber } from "@/lib/ui/status-badge-styles";
import { ProgressMiniWidget } from "@/components/ProgressMiniWidget";

interface HomePageContentProps {
  assignments: StudentAssignmentListItem[];
  keystoneExam?: KeystoneExamInfo | null;
}

const TODO_LIMIT = 3;

export function HomePageContent({
  assignments,
  keystoneExam = null,
}: HomePageContentProps) {
  const activeAssignments = assignments.filter((a) => a.status !== "completed");
  const todoItems = selectTodoAssignments(activeAssignments, TODO_LIMIT);
  const totalAssignments = assignments.length;
  const overdueInTodo = todoItems.filter((a) => isOverdue(a.due_date)).length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-2">
          Home
        </h1>
      </section>

      {keystoneExam && <KeystoneExamCountdown exam={keystoneExam} />}

      <section className="grid gap-4 lg:grid-cols-3 mb-6">
        <div className="lg:col-span-3 rounded-2xl border border-primary/25 bg-surface p-5 sm:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="inline-flex items-center gap-2 text-primary dark:text-forest">
              <ClipboardList className="w-5 h-5" />
              <span className="font-semibold">To do</span>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-forest">
              {activeAssignments.length} active
            </span>
          </div>

          {todoItems.length === 0 ? (
            <div>
              <p className="text-base text-slate-gray/85">
                {totalAssignments === 0
                  ? "No active assignments right now."
                  : "All caught up! No pending assignments."}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {totalAssignments === 0
                  ? "Use Self Practice to keep your momentum."
                  : "Nice work. You can review completed assignments below."}
              </p>
            </div>
          ) : (
            <>
              {overdueInTodo > 0 && (
                <p className="text-xs font-medium text-error mb-2">
                  {overdueInTodo} past due —{" "}
                  {overdueInTodo === 1 ? "complete it" : "complete them"} first.
                </p>
              )}
              <ul className="space-y-2">
                {todoItems.map((a) => (
                  <TodoRow key={a.id} assignment={a} />
                ))}
              </ul>
            </>
          )}

          <div className="mt-5">
            <Link
              href="/assignments"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
            >
              View all assignments
            </Link>
          </div>
        </div>

        <div className="lg:col-span-3 grid gap-4 sm:grid-cols-2">
          <Link
            href="/self-practice"
            className="rounded-2xl border border-primary/25 bg-surface p-5 sm:p-6 shadow-sm hover:border-primary transition-colors"
          >
            <div className="inline-flex items-center gap-2 text-primary dark:text-forest mb-2">
              <NotebookPen className="w-5 h-5" />
              <span className="font-semibold">Self Practice</span>
            </div>
            <p className="text-sm text-slate-gray/80">
              Choose topic and mode, then start a focused practice session.
            </p>
            <div className="mt-4">
              <span className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors">
                Start self practice
              </span>
            </div>
          </Link>

          <ProgressMiniWidget />
        </div>
      </section>
    </main>
  );
}

function KeystoneExamCountdown({ exam }: { exam: KeystoneExamInfo }) {
  const days = daysUntilExam(exam.examDate);
  if (days === null || days < 0) return null;

  const { accent, subtitle } = getCountdownTone(days);
  const headline =
    days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;

  return (
    <section
      aria-label="Keystone exam countdown"
      className={`mb-6 rounded-2xl border ${accent.border} ${accent.bg} p-5 sm:p-6 shadow-sm`}
    >
      <div className="flex items-start gap-4 sm:gap-5">
        <div
          className={`hidden sm:flex items-center justify-center w-12 h-12 rounded-full ${accent.iconBg} ${accent.iconText}`}
        >
          <Flame className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${accent.label}`}
          >
            <Flame className="w-4 h-4 sm:hidden" />
            Keystone Exam
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {days === 0 ? (
              <span
                className={`text-3xl sm:text-4xl font-extrabold ${accent.headline}`}
              >
                It&apos;s exam day
              </span>
            ) : (
              <>
                <span
                  className={`text-4xl sm:text-5xl font-extrabold ${accent.headline}`}
                >
                  {headline}
                </span>
                <span
                  className={`text-sm sm:text-base font-semibold ${accent.text}`}
                >
                  to go
                </span>
              </>
            )}
          </div>
          <p className={`mt-1 text-sm ${accent.text}`}>{subtitle}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5" />
            Exam date: {formatExamDate(exam.examDate)}
          </p>
        </div>
      </div>
    </section>
  );
}

type CountdownTone = {
  border: string;
  bg: string;
  iconBg: string;
  iconText: string;
  label: string;
  headline: string;
  text: string;
};

function getCountdownTone(days: number): {
  accent: CountdownTone;
  subtitle: string;
} {
  if (days <= 7) {
    return {
      accent: {
        border: "border-error-border",
        bg: "bg-gradient-to-r from-red-50 to-orange-50 dark:from-rose-950/50 dark:to-orange-950/40",
        iconBg: "bg-error-light",
        iconText: "text-error",
        label: "text-error",
        headline: "text-error",
        text: "text-error/90",
      },
      subtitle:
        days === 0
          ? "Stay focused — you've got this!"
          : "Final stretch. Every practice session counts.",
    };
  }
  if (days <= 30) {
    return {
      accent: {
        border: "border-amber-300 dark:border-amber-700/40",
        bg: "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/45 dark:to-amber-950/30",
        iconBg: "bg-amber-100 dark:bg-amber-900/50",
        iconText: "text-amber-600 dark:text-amber-300",
        label: "text-amber-700 dark:text-amber-300",
        headline: "text-amber-700 dark:text-amber-200",
        text: "text-amber-800/90 dark:text-amber-200/80",
      },
      subtitle: "The exam is coming up. Keep your streak going!",
    };
  }
  return {
    accent: {
      border: "border-primary/40 dark:border-primary-border",
      bg: "bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-emerald-950/30",
      iconBg: "bg-primary/15",
      iconText: "text-primary",
      label: "text-primary-hover dark:text-forest",
      headline: "text-heading",
      text: "text-heading/80 dark:text-muted-foreground",
    },
    subtitle: "Plenty of time — steady practice builds confidence.",
  };
}

function TodoRow({ assignment }: { assignment: StudentAssignmentListItem }) {
  const overdue = isOverdue(assignment.due_date);
  const ctaLabel: string =
    assignment.status === "in_progress" ? "Continue" : "Start";
  const href = buildPracticeHref(assignment);

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border-default bg-surface px-3 py-2 hover:border-primary/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-gray truncate">
            {assignment.title}
          </p>
          <AssignmentModeBadge mode={assignment.mode} size="xs" />
          {overdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-error bg-error-light px-1.5 py-0.5 rounded-full">
              <Clock className="w-3 h-3" />
              Overdue
            </span>
          )}
          <StatusDot status={assignment.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          <DueLabel dueDate={assignment.due_date} overdue={overdue} />
          {assignment.progress.total > 0 && (
            <span>
              {assignment.progress.answered}/
              {assignment.mode === "review"
                ? `up to ${assignment.progress.total}`
                : assignment.progress.total}{" "}
              answered
            </span>
          )}
        </p>
      </div>
      <Link
        href={href}
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-colors"
      >
        <Play className="w-3.5 h-3.5" />
        {ctaLabel}
      </Link>
    </li>
  );
}

function DueLabel({
  dueDate,
  overdue,
}: {
  dueDate: string | null | undefined;
  overdue: boolean;
}) {
  if (!dueDate) {
    return <span className="text-muted-foreground">No due date</span>;
  }
  const text = `Due ${formatDueDateTime(dueDate)}`;
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        overdue ? "text-error font-medium" : "text-muted-foreground"
      }`}
    >
      <CalendarDays className="w-3 h-3" />
      {text}
    </span>
  );
}

function StatusDot({ status }: { status: StudentAssignmentStatus }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-heading">
        <CheckCircle2 className="w-3 h-3" />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span
        className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${badgeAmber}`}
      >
        In progress
      </span>
    );
  }
  return null;
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

/**
 * Pick the top `limit` assignments to show as TODOs.
 * - Overdue items are pinned to the top.
 * - Within each group, items are sorted by due date ascending (no-due-date at end).
 */
function selectTodoAssignments(
  active: StudentAssignmentListItem[],
  limit: number,
): StudentAssignmentListItem[] {
  const overdue: StudentAssignmentListItem[] = [];
  const upcoming: StudentAssignmentListItem[] = [];
  for (const a of active) {
    if (isOverdue(a.due_date)) overdue.push(a);
    else upcoming.push(a);
  }
  overdue.sort((a, b) => dueDateSortKey(a) - dueDateSortKey(b));
  upcoming.sort((a, b) => dueDateSortKey(a) - dueDateSortKey(b));
  return [...overdue, ...upcoming].slice(0, limit);
}

function buildPracticeHref(a: StudentAssignmentListItem): string {
  const questionCount =
    a.max_questions ?? Math.max(6, Math.min(40, Math.round(a.target_minutes / 1.8)));
  // URLSearchParams handles the %-encoding of each value on toString(). Do NOT
  // pre-encode topics here (would double-encode, e.g. " " -> "%20" -> "%2520"
  // and break PracticePageClient's decodeURIComponent on the receiving side).
  const params = new URLSearchParams({
    mode: a.mode,
    assignmentId: a.id,
    questions: String(questionCount),
    topics: a.topics.join(","),
  });
  return `/practice?${params.toString()}`;
}
