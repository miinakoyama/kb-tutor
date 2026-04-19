"use client";

import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  NotebookPen,
  Play,
} from "lucide-react";
import type { StudentNotification } from "@/lib/notifications";
import type {
  StudentAssignmentListItem,
  StudentAssignmentStatus,
} from "@/lib/student-assignments";
import { formatDueDateTime } from "@/lib/due-date";

interface HomePageContentProps {
  assignments: StudentAssignmentListItem[];
  notifications: StudentNotification[];
}

const TODO_LIMIT = 3;

export function HomePageContent({
  assignments,
  notifications,
}: HomePageContentProps) {
  const topNotifications = notifications.slice(0, 3);
  const unreadCount = notifications.filter((item) => !item.read).length;
  const latestNotification =
    topNotifications[0]?.message ?? "No new notifications.";

  const activeAssignments = assignments.filter((a) => a.status !== "completed");
  const todoItems = selectTodoAssignments(activeAssignments, TODO_LIMIT);
  const totalAssignments = assignments.length;
  const overdueInTodo = todoItems.filter((a) => isOverdue(a.due_date)).length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Home
        </h1>
      </section>

      <section className="grid gap-4 lg:grid-cols-3 mb-6">
        <div className="lg:col-span-3 rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="inline-flex items-center gap-2 text-[#16a34a]">
              <ClipboardList className="w-5 h-5" />
              <span className="font-semibold">To do</span>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-[#16a34a]/10 text-[#166534]">
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
              <p className="text-sm text-slate-gray/70 mt-1">
                {totalAssignments === 0
                  ? "Use Self Practice to keep your momentum."
                  : "Nice work. You can review completed assignments below."}
              </p>
            </div>
          ) : (
            <>
              {overdueInTodo > 0 && (
                <p className="text-xs font-medium text-red-700 mb-2">
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
              className="inline-flex items-center justify-center rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d] transition-colors"
            >
              View all assignments
            </Link>
          </div>
        </div>

        <div className="lg:col-span-3 grid gap-4 sm:grid-cols-2">
          <Link
            href="/self-practice"
            className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm hover:border-[#16a34a] transition-colors"
          >
            <div className="inline-flex items-center gap-2 text-[#16a34a] mb-2">
              <NotebookPen className="w-5 h-5" />
              <span className="font-semibold">Self Practice</span>
            </div>
            <p className="text-sm text-slate-gray/80">
              Choose topic and mode, then start a focused practice session.
            </p>
            <div className="mt-4">
              <span className="inline-flex items-center justify-center rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d] transition-colors">
                Start self practice
              </span>
            </div>
          </Link>

          <Link
            href="/notifications"
            className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm hover:border-[#16a34a] transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="inline-flex items-center gap-2 text-[#16a34a]">
                <Bell className="w-5 h-5" />
                <span className="font-semibold">Notifications</span>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-[#16a34a]/10 text-[#166534]">
                {unreadCount} unread
              </span>
            </div>
            <p className="text-sm text-slate-gray/80 line-clamp-3">
              {latestNotification}
            </p>
            <div className="mt-4">
              <span className="inline-flex items-center justify-center rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d] transition-colors">
                View notifications
              </span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}

function TodoRow({ assignment }: { assignment: StudentAssignmentListItem }) {
  const overdue = isOverdue(assignment.due_date);
  const ctaLabel: string =
    assignment.status === "in_progress" ? "Continue" : "Start";
  const href = buildPracticeHref(assignment);

  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-[#16a34a]/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-gray truncate">
            {assignment.title}
          </p>
          {overdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">
              <Clock className="w-3 h-3" />
              Overdue
            </span>
          )}
          <StatusDot status={assignment.status} />
        </div>
        <p className="text-xs text-slate-gray/70 mt-0.5 flex items-center gap-2 flex-wrap">
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
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#16a34a] text-white text-xs font-semibold hover:bg-[#15803d] transition-colors"
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
    return <span className="text-slate-gray/50">No due date</span>;
  }
  const text = `Due ${formatDueDateTime(dueDate)}`;
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        overdue ? "text-red-700 font-medium" : "text-slate-gray/70"
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
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#14532d]">
        <CheckCircle2 className="w-3 h-3" />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
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
