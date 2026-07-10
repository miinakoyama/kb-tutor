"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { buildPracticeHref } from "@/components/assignments/AssignmentRow";
import {
  estimateQuestionCount,
  getAssignmentModeMeta,
} from "@/components/assignments/assignment-design";
import { InstructorNoteIndicator } from "@/components/assignments/InstructorNoteIndicator";

const ROWS_PAGE_SIZE = 5;

// --- ⋯ Menu (unchanged) ---

function KebabMenu({ assignment }: { assignment: StudentAssignmentListItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const reviewHref =
    assignment.recorded_completion_count === 1
      ? `/assignments/${encodeURIComponent(assignment.id)}/history/1?direct=1`
      : `/assignments/${encodeURIComponent(assignment.id)}/history`;

  const retryHref = buildPracticeHref(assignment);
  const attemptsCapped =
    assignment.max_attempts != null &&
    assignment.completed_attempts >= assignment.max_attempts;
  const attemptsLimitText =
    assignment.max_attempts != null
      ? `Attempts used: ${assignment.completed_attempts} / ${assignment.max_attempts}`
      : null;

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label="More options"
        className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden py-2"
          style={{
            borderRadius: 16,
            background: "var(--assignment-popover-bg)",
            border: "1px solid var(--assignment-popover-border)",
            boxShadow: "var(--assignment-popover-shadow)",
            backdropFilter: "blur(16px) saturate(125%)",
            WebkitBackdropFilter: "blur(16px) saturate(125%)",
          }}
        >
          <Link
            href={reviewHref}
            onClick={() => setOpen(false)}
            className="mx-2 flex items-center rounded-xl px-3 py-2.5 text-sm text-slate-gray transition-colors hover:bg-primary/10"
            style={{
              fontSize: 15,
              lineHeight: 1.4,
              fontWeight: 500,
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            }}
          >
            Review
          </Link>
          {attemptsCapped ? (
            <div className="mx-2 rounded-xl px-3 py-2.5">
              <p
                className="text-muted-foreground line-through"
                style={{
                  fontSize: 15,
                  lineHeight: 1.4,
                  fontWeight: 500,
                  fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                }}
              >
                Retry
              </p>
              <p
                className="mt-1 text-muted-foreground"
                style={{
                  fontSize: 12,
                  lineHeight: 1.4,
                  fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
                }}
              >
                Maximum retries reached.
              </p>
              {attemptsLimitText && (
                <p
                  className="mt-1 text-muted-foreground"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
                  }}
                >
                  {attemptsLimitText}
                </p>
              )}
            </div>
          ) : (
            <div className="mx-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary/10">
              <Link
                href={retryHref}
                onClick={() => setOpen(false)}
                className="block text-slate-gray transition-colors hover:text-foreground"
                style={{
                  fontSize: 15,
                  lineHeight: 1.4,
                  fontWeight: 500,
                  fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                }}
              >
                Retry
              </Link>
              {attemptsLimitText && (
                <p
                  className="mt-1 text-muted-foreground"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
                  }}
                >
                  {attemptsLimitText}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Completed Row ---

function CompletedRow({ assignment }: { assignment: StudentAssignmentListItem }) {
  const { mode, progress } = assignment;
  const { Icon, color, label, pillBg, pillBorder } =
    getAssignmentModeMeta(mode);

  const questionCount =
    progress.total > 0
      ? progress.total
      : (assignment.max_questions ?? estimateQuestionCount(assignment.target_minutes));
  const instructorNote = assignment.instructions?.trim() ?? "";

  const completedDate = assignment.last_completed_at
    ? new Date(assignment.last_completed_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div
      className="flex flex-col items-start gap-4 rounded-2xl px-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6"
      style={{
        minHeight: 104,
        paddingTop: 16,
        paddingBottom: 16,
        background: "var(--assignment-glass-bg)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-card-shadow)",
      }}
    >
      {/* Mode icon */}
      <Icon
        style={{ width: 24, height: 24, color, flexShrink: 0 }}
        aria-hidden="true"
      />

      {/* Title + mode badge + question count */}
      <div className="flex-1 min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <p
            className="truncate text-slate-gray"
            style={{
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 1.4,
              letterSpacing: -0.4,
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            }}
          >
            {assignment.title}
          </p>
          {instructorNote && <InstructorNoteIndicator note={instructorNote} />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center rounded-full px-3 py-1"
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              letterSpacing: -0.1,
              fontWeight: 500,
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              color,
              background: pillBg,
              border: `1.5px solid ${pillBorder}`,
              boxShadow: "var(--assignment-pill-highlight)",
            }}
          >
            {label}
          </span>
          {questionCount > 0 && (
            <span
              className="text-muted-foreground"
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                letterSpacing: -0.1,
                fontWeight: 400,
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              {questionCount} questions
            </span>
          )}
        </div>
      </div>

      {/* Completed date + score */}
      <div
        className="hidden sm:flex flex-shrink-0 flex-col justify-center"
        style={{ width: 196 }}
      >
        {completedDate && (
          <span
            className="text-muted-foreground"
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              letterSpacing: -0.1,
              fontWeight: 400,
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            }}
          >
            Completed {completedDate}
          </span>
        )}
        {assignment.accuracy != null && (
          <span
            className="text-muted-foreground"
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              letterSpacing: -0.1,
              fontWeight: 400,
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            }}
          >
            Score: {assignment.accuracy}%
          </span>
        )}
      </div>

      {/* ⋯ menu */}
      {assignment.recorded_completion_count > 0 && (
        <KebabMenu assignment={assignment} />
      )}
    </div>
  );
}

// --- Section ---

export function CompletedSection({
  assignments,
}: {
  assignments: StudentAssignmentListItem[];
}) {
  const [open, setOpen] = useState(true);
  const [allVisible, setAllVisible] = useState(false);

  if (assignments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground mt-6">
        No completed assignments yet.
      </p>
    );
  }

  const visibleRows = allVisible
    ? assignments
    : assignments.slice(0, ROWS_PAGE_SIZE);
  const hiddenCount = assignments.length - ROWS_PAGE_SIZE;

  return (
    <section>
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground transition-colors"
        style={{
          fontSize: 14,
          letterSpacing: "0.4px",
          marginBottom: 10,
          textTransform: "uppercase",
        }}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        Completed ({assignments.length})
      </button>

      {open && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3">
            {visibleRows.map((a) => (
              <CompletedRow key={a.id} assignment={a} />
            ))}
          </div>
          {!allVisible && hiddenCount > 0 && (
            <div
              className="rounded-2xl px-5 py-3"
              style={{
                background: "var(--assignment-glass-bg)",
                border: "1px solid var(--assignment-glass-border)",
                boxShadow: "var(--assignment-card-shadow)",
              }}
            >
              <button
                type="button"
                onClick={() => setAllVisible(true)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View all ({assignments.length})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
