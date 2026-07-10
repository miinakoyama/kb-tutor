"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { formatDueDateTime } from "@/lib/due-date";

type CalendarDay = {
  key: string;
  date: Date;
  inMonth: boolean;
  dueCount: number;
  doneCount: number;
  isToday: boolean;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function toValidDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  return `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
}

function weekTitle(weekStart: Date): string {
  const currentWeekStart = startOfWeek(startOfDay(new Date()));
  const offsetWeeks = Math.round(
    (weekStart.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  if (offsetWeeks === 0) return "This Week";
  if (offsetWeeks === -1) return "Last Week";
  if (offsetWeeks === 1) return "Next Week";
  return "";
}

function buildCalendarDays(
  monthCursor: Date,
  dueByDay: Map<string, number>,
  doneByDay: Map<string, number>,
): CalendarDay[] {
  const monthStart = new Date(
    monthCursor.getFullYear(),
    monthCursor.getMonth(),
    1,
  );
  const monthEnd = new Date(
    monthCursor.getFullYear(),
    monthCursor.getMonth() + 1,
    0,
  );
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
  const today = startOfDay(new Date());

  const days: CalendarDay[] = [];
  for (
    let cursor = gridStart;
    cursor.getTime() <= gridEnd.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const key = dayKey(cursor);
    days.push({
      key,
      date: cursor,
      inMonth: cursor.getMonth() === monthCursor.getMonth(),
      dueCount: dueByDay.get(key) ?? 0,
      doneCount: doneByDay.get(key) ?? 0,
      isToday: cursor.getTime() === today.getTime(),
    });
  }
  return days;
}

function WeeklyItem({
  assignment,
  kind,
}: {
  assignment: StudentAssignmentListItem;
  kind: "todo" | "done";
}) {
  const completedDate = toValidDate(assignment.last_completed_at);
  const dueDate = toValidDate(assignment.due_date);
  const accentColor =
    kind === "done"
      ? "var(--assignment-completed-muted)"
      : "var(--assignment-due-muted)";

  return (
    <div
      className="relative flex items-start overflow-hidden rounded-2xl bg-surface px-4"
      style={{
        minHeight: 68,
        paddingTop: 14,
        paddingBottom: 14,
        background: "var(--assignment-glass-bg)",
        border: "1px solid var(--assignment-panel-border)",
        backdropFilter: "blur(14px) saturate(112%)",
        WebkitBackdropFilter: "blur(14px) saturate(112%)",
      }}
    >
      <span
        className="absolute left-0 top-0 h-full"
        style={{
          width: 4,
          background: accentColor,
        }}
        aria-hidden="true"
      />

      <div className="min-w-0">
        <p
          className="truncate text-slate-gray"
          style={{
            fontSize: 15,
            lineHeight: 1.4,
            fontWeight: 600,
            fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            textDecoration: kind === "done" ? "line-through" : "none",
            textDecorationColor: kind === "done" ? accentColor : undefined,
            textDecorationThickness: kind === "done" ? "2.5px" : undefined,
          }}
        >
          {assignment.title}
        </p>
        {kind === "done" ? (
          <div className="mt-1">
            {completedDate && (
              <p
                className="text-muted-foreground"
                style={{ fontSize: 12, lineHeight: 1.45 }}
              >
                Completed{" "}
                {completedDate.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        ) : (
          dueDate && (
            <p
              className="mt-1 text-muted-foreground"
              style={{
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {formatDueDateTime(assignment.due_date)}
            </p>
          )
        )}
      </div>
    </div>
  );
}

export function ThisWeekSidebar({
  assignments,
}: {
  assignments: StudentAssignmentListItem[];
}) {
  const [monthCursor, setMonthCursor] = useState(() => startOfDay(new Date()));
  const [weekCursor, setWeekCursor] = useState(() =>
    startOfWeek(startOfDay(new Date())),
  );
  const touchStartXRef = useRef<number | null>(null);

  const selectedWeekStart = startOfWeek(startOfDay(weekCursor));
  const selectedWeekEnd = endOfDay(addDays(selectedWeekStart, 6));
  const selectedWeekStartTime = selectedWeekStart.getTime();
  const selectedWeekEndTime = selectedWeekEnd.getTime();
  const selectedWeekTitle = weekTitle(selectedWeekStart);

  const moveWeek = (weeks: number) => {
    setWeekCursor((current) => addDays(startOfWeek(startOfDay(current)), weeks * 7));
  };

  const handleWeekTouchEnd = (clientX: number) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX == null) return;

    const deltaX = clientX - startX;
    if (Math.abs(deltaX) < 48) return;
    moveWeek(deltaX > 0 ? -1 : 1);
  };

  const { dueByDay, doneByDay, weeklyTodos, weeklyDone } = useMemo(() => {
    const dueMap = new Map<string, number>();
    const doneMap = new Map<string, number>();

    const todos: StudentAssignmentListItem[] = [];
    const done: StudentAssignmentListItem[] = [];

    for (const assignment of assignments) {
      const dueDate = toValidDate(assignment.due_date);
      if (dueDate && assignment.status !== "completed") {
        const key = dayKey(dueDate);
        dueMap.set(key, (dueMap.get(key) ?? 0) + 1);

        if (
          dueDate.getTime() >= selectedWeekStartTime &&
          dueDate.getTime() <= selectedWeekEndTime
        ) {
          todos.push(assignment);
        }
      }

      const doneDate = toValidDate(assignment.last_completed_at);
      if (doneDate && assignment.status === "completed") {
        const key = dayKey(doneDate);
        doneMap.set(key, (doneMap.get(key) ?? 0) + 1);

        if (
          doneDate.getTime() >= selectedWeekStartTime &&
          doneDate.getTime() <= selectedWeekEndTime
        ) {
          done.push(assignment);
        }
      }
    }

    todos.sort((a, b) => {
      const aTime = toValidDate(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bTime = toValidDate(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });

    done.sort((a, b) => {
      const aTime = toValidDate(a.last_completed_at)?.getTime() ?? 0;
      const bTime = toValidDate(b.last_completed_at)?.getTime() ?? 0;
      return bTime - aTime;
    });

    return {
      dueByDay: dueMap,
      doneByDay: doneMap,
      weeklyTodos: todos,
      weeklyDone: done,
    };
  }, [assignments, selectedWeekEndTime, selectedWeekStartTime]);

  const calendarDays = useMemo(
    () => buildCalendarDays(monthCursor, dueByDay, doneByDay),
    [monthCursor, dueByDay, doneByDay],
  );

  const hasCalendarMarks = dueByDay.size > 0 || doneByDay.size > 0;
  const hasWeekContent = weeklyTodos.length > 0 || weeklyDone.length > 0;

  if (!hasCalendarMarks && !hasWeekContent) return null;

  return (
    <aside className="flex w-full flex-col gap-10">
      <section
        className="rounded-[26px] px-4 py-5 sm:px-5"
        style={{
          background: "var(--assignment-glass-bg)",
          border: "1px solid var(--assignment-panel-border)",
          backdropFilter: "blur(18px) saturate(118%)",
          WebkitBackdropFilter: "blur(18px) saturate(118%)",
        }}
      >
        <div
          style={{
            width: "90%",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
        <div
          className="flex w-full items-center justify-between"
          style={{ marginBottom: 14 }}
        >
          <div>
            <h2
              className="text-slate-gray"
              style={{
                fontSize: 19,
                lineHeight: 1.2,
                fontWeight: 600,
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                marginTop: 0,
              }}
            >
              {monthCursor.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setMonthCursor(
                  new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
                )
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-gray transition-colors hover:bg-[var(--assignment-calendar-nav-bg-hover)]"
              style={{
                background: "var(--assignment-calendar-nav-bg)",
                border: "1px solid var(--assignment-glass-border)",
                boxShadow: "var(--assignment-nav-shadow)",
                backdropFilter: "blur(10px) saturate(130%)",
                WebkitBackdropFilter: "blur(10px) saturate(130%)",
              }}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() =>
                setMonthCursor(
                  new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
                )
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-gray transition-colors hover:bg-[var(--assignment-calendar-nav-bg-hover)]"
              style={{
                background: "var(--assignment-calendar-nav-bg)",
                border: "1px solid var(--assignment-glass-border)",
                boxShadow: "var(--assignment-nav-shadow)",
                backdropFilter: "blur(10px) saturate(130%)",
                WebkitBackdropFilter: "blur(10px) saturate(130%)",
              }}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mb-0.5 grid w-full grid-cols-7 gap-[1px]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="text-left text-muted-foreground"
              style={{
                fontSize: 12,
                fontWeight: 400,
                fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
              }}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid w-full grid-cols-7 gap-[1px]">
          {calendarDays.map((day) => {
            const hasDue = day.dueCount > 0;
            const hasDone = day.doneCount > 0;

            return (
              <div
                key={day.key}
                className="flex aspect-square flex-col items-start justify-center px-0 py-0"
                style={{
                  minHeight: 22,
                  opacity: day.inMonth ? 1 : 0.45,
                }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-[14px]"
                  style={{
                    width: 22,
                    height: 22,
                    fontSize: 12,
                    lineHeight: 1,
                    fontWeight: day.isToday ? 600 : 400,
                    fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
                    color: day.isToday ? "var(--assignment-on-accent)" : "var(--foreground)",
                    background: day.isToday ? "var(--assignment-completed)" : "transparent",
                  }}
                >
                  {day.date.getDate()}
                </span>

                {(hasDue || hasDone) && (
                  <div
                    className="mt-0.5 flex items-center justify-center gap-1"
                    style={{ width: 22 }}
                    aria-label={`${day.dueCount} due, ${day.doneCount} completed`}
                  >
                    {hasDue && (
                      <span
                        className="rounded-full"
                        style={{
                          width: 4,
                          height: 4,
                          background: "var(--assignment-due)",
                        }}
                      />
                    )}
                    {hasDone && (
                      <span
                        className="rounded-full"
                        style={{
                          width: 4,
                          height: 4,
                          background: "var(--assignment-completed)",
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="flex w-full items-center text-muted-foreground"
          style={{
            marginTop: 14,
            gap: 24,
            fontSize: 12,
            fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="rounded-full"
              style={{
                width: 4,
                height: 4,
                background: "var(--assignment-due)",
              }}
            />
            Due
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-full"
              style={{
                width: 4,
                height: 4,
                background: "var(--assignment-completed)",
              }}
            />
            Completed
          </div>
        </div>
        </div>
      </section>

      <section
        className="flex flex-col gap-10"
        onTouchStart={(event) => {
          touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const touch = event.changedTouches[0];
          if (touch) handleWeekTouchEnd(touch.clientX);
        }}
      >
        <div>
          <div
            className="flex items-end justify-between gap-3"
            style={{ marginBottom: 10 }}
          >
            <div>
              {selectedWeekTitle && (
                <h3
                  className="text-muted-foreground uppercase tracking-wide"
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  {selectedWeekTitle}
                </h3>
              )}
              <p
                className="text-muted-foreground"
                style={{
                  marginTop: selectedWeekTitle ? 2 : 0,
                  fontSize: selectedWeekTitle ? 11 : 14,
                  lineHeight: 1.35,
                }}
              >
                {formatWeekRange(selectedWeekStart)}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => moveWeek(-1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-gray transition-colors hover:bg-[var(--assignment-calendar-nav-bg-hover)]"
                style={{
                  background: "var(--assignment-calendar-nav-bg)",
                  border: "1px solid var(--assignment-glass-border)",
                  boxShadow: "var(--assignment-nav-shadow)",
                  backdropFilter: "blur(10px) saturate(130%)",
                  WebkitBackdropFilter: "blur(10px) saturate(130%)",
                }}
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => moveWeek(1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-gray transition-colors hover:bg-[var(--assignment-calendar-nav-bg-hover)]"
                style={{
                  background: "var(--assignment-calendar-nav-bg)",
                  border: "1px solid var(--assignment-glass-border)",
                  boxShadow: "var(--assignment-nav-shadow)",
                  backdropFilter: "blur(10px) saturate(130%)",
                  WebkitBackdropFilter: "blur(10px) saturate(130%)",
                }}
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {weeklyTodos.length === 0 ? (
              <p
                className="rounded-2xl px-4 py-4 text-sm text-muted-foreground"
                style={{
                  background: "var(--assignment-glass-bg)",
                  border: "1px solid var(--assignment-panel-border)",
                  backdropFilter: "blur(14px) saturate(112%)",
                  WebkitBackdropFilter: "blur(14px) saturate(112%)",
                }}
              >
                No to-dos in this range.
              </p>
            ) : (
              weeklyTodos.map((assignment) => (
                <WeeklyItem
                  key={`todo-${assignment.id}`}
                  assignment={assignment}
                  kind="todo"
                />
              ))
            )}
          </div>
        </div>

        <div>
          <h3
            className="text-muted-foreground uppercase tracking-wide"
            style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}
          >
            Done
          </h3>
          <div className="flex flex-col gap-3">
            {weeklyDone.length === 0 ? (
              <p
                className="rounded-2xl px-4 py-4 text-sm text-muted-foreground"
                style={{
                  background: "var(--assignment-glass-bg)",
                  border: "1px solid var(--assignment-panel-border)",
                  backdropFilter: "blur(14px) saturate(112%)",
                  WebkitBackdropFilter: "blur(14px) saturate(112%)",
                }}
              >
                No completed assignments in this range.
              </p>
            ) : (
              weeklyDone.map((assignment) => (
                <WeeklyItem
                  key={`done-${assignment.id}`}
                  assignment={assignment}
                  kind="done"
                />
              ))
            )}
          </div>
        </div>
      </section>
    </aside>
  );
}
