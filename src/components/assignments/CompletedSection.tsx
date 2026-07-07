"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";

const ROWS_PAGE_SIZE = 5;

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

// --- ⋯ Menu ---

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
        <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-border-default bg-surface shadow-md z-20 py-1">
          {/* Review */}
          <Link
            href={reviewHref}
            onClick={() => setOpen(false)}
            className="flex items-center px-3 py-2 text-sm text-slate-gray hover:bg-foreground/5 transition-colors"
          >
            Review
          </Link>

          {/* Retry */}
          {attemptsCapped ? (
            <div className="px-3 py-2">
              <p className="text-sm text-muted-foreground line-through">
                Retry
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                No attempts left
              </p>
            </div>
          ) : (
            <Link
              href={retryHref}
              onClick={() => setOpen(false)}
              className="flex items-center px-3 py-2 text-sm text-slate-gray hover:bg-foreground/5 transition-colors"
            >
              Retry
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// --- Row ---

function CompletedRow({ assignment }: { assignment: StudentAssignmentListItem }) {
  return (
    <div
      className="flex items-center gap-3 px-1"
      style={{ minHeight: 48 }}
    >
      {/* Name */}
      <p
        className="flex-1 min-w-0 font-medium text-slate-gray truncate"
        style={{ fontSize: 14 }}
      >
        {assignment.title}
      </p>

      {/* Accuracy */}
      <span
        className="flex-shrink-0 font-medium text-slate-gray"
        style={{ fontSize: 13, minWidth: 40, textAlign: "right" }}
      >
        {assignment.accuracy != null ? `${assignment.accuracy}%` : "—"}
      </span>

      {/* Date */}
      {assignment.last_completed_at && (
        <span
          className="flex-shrink-0 text-muted-foreground hidden sm:block"
          style={{ fontSize: 12, minWidth: 72, textAlign: "right" }}
        >
          {new Date(assignment.last_completed_at).toLocaleDateString()}
        </span>
      )}

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
  const [open, setOpen] = useState(false);
  const [allVisible, setAllVisible] = useState(false);

  if (assignments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No completed assignments yet.
      </p>
    );
  }

  const visibleRows =
    allVisible ? assignments : assignments.slice(0, ROWS_PAGE_SIZE);
  const hiddenCount = assignments.length - ROWS_PAGE_SIZE;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        style={{ fontSize: 13 }}
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
        <div>
          {/* Hairline-divided rows */}
          <div className="divide-y divide-border-subtle">
            {visibleRows.map((a) => (
              <CompletedRow key={a.id} assignment={a} />
            ))}
          </div>

          {!allVisible && hiddenCount > 0 && (
            <p className="text-center mt-3">
              <button
                type="button"
                onClick={() => setAllVisible(true)}
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View all ({assignments.length})
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
