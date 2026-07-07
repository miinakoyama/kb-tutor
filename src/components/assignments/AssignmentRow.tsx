"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { formatDueDateTime } from "@/lib/due-date";
import {
  estimateQuestionCount,
  getAssignmentModeMeta,
  isAssignmentOverdue,
} from "@/components/assignments/assignment-design";
import { InstructorNoteIndicator } from "@/components/assignments/InstructorNoteIndicator";

export function buildPracticeHref(assignment: StudentAssignmentListItem): string {
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

export function AssignmentRow({
  assignment,
  isNextStep = false,
}: {
  assignment: StudentAssignmentListItem;
  isNextStep?: boolean;
}) {
  const href = buildPracticeHref(assignment);
  const overdue = isAssignmentOverdue(assignment);
  const { mode, progress } = assignment;
  const { Icon, color, label, pillBg, pillBorder } =
    getAssignmentModeMeta(mode);

  const questionCount =
    progress.total > 0
      ? progress.total
      : (assignment.max_questions ?? estimateQuestionCount(assignment.target_minutes));

  const ctaLabel = assignment.status === "in_progress" ? "Continue" : "Start";
  const instructorNote = assignment.instructions?.trim() ?? "";
  const ctaStyle = isNextStep
    ? {
        color: "var(--assignment-cta-text)",
        background: "var(--assignment-cta-bg-strong)",
        border: "1.5px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-cta-elevated-shadow)",
      }
    : {
        color: "var(--assignment-row-cta-text)",
        background: "var(--assignment-row-cta-bg)",
        border: "1.5px solid var(--assignment-row-cta-border)",
        boxShadow: "var(--assignment-row-cta-shadow)",
      };

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
        backdropFilter: "blur(14px) saturate(115%)",
        WebkitBackdropFilter: "blur(14px) saturate(115%)",
      }}
    >
      {/* Mode icon */}
      <Icon
        style={{ width: 24, height: 24, color, flexShrink: 0 }}
        aria-hidden="true"
      />

      {/* Title + subline */}
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

      {/* Due date — fixed 180px column */}
      <div
        className="hidden sm:flex flex-shrink-0 items-center gap-3"
        style={{
          width: 196,
          color: assignment.due_date
            ? overdue ? "var(--assignment-overdue)" : "var(--muted-foreground)"
            : "transparent",
        }}
      >
        {assignment.due_date && (
          <>
            <Calendar style={{ width: 13, height: 13 }} aria-hidden="true" />
            <span
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                letterSpacing: -0.1,
                fontWeight: 400,
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              {formatDueDateTime(assignment.due_date)}
            </span>
          </>
        )}
      </div>

      {/* CTA button — fixed ~72px */}
      <Link
        href={href}
        className={`inline-flex h-11 w-full flex-shrink-0 items-center justify-center rounded-xl font-bold transition duration-200 hover:-translate-y-px active:translate-y-0 sm:w-[108px] ${
          isNextStep
            ? "hover:brightness-110 active:brightness-95"
            : "hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)]"
        }`}
        style={{
          fontSize: 16,
          lineHeight: 1.5,
          letterSpacing: "0.3px",
          wordSpacing: "1px",
          fontWeight: 700,
          height: 46,
          borderRadius: 999,
          fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
          ...ctaStyle,
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
