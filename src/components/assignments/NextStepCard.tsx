"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, MessageCircle } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { formatDueDateTime } from "@/lib/due-date";
import { buildPracticeHref } from "@/components/assignments/AssignmentRow";
import {
  getAssignmentModeMeta,
  isAssignmentOverdue,
} from "@/components/assignments/assignment-design";

function attemptsText(assignment: StudentAssignmentListItem): string {
  if (assignment.max_attempts == null) return "Unlimited attempts";
  return `${assignment.max_attempts} attempts allowed`;
}

// --- Component ---

export function NextStepCard({
  assignment,
}: {
  assignment: StudentAssignmentListItem;
}) {
  const [noteExpanded, setNoteExpanded] = useState(false);
  const markerWidth = 110;
  // Effective visible image start inside the PNG (left transparent gutter excluded).
  // Use this for edge clamping so the visible content, not the transparent canvas, aligns to track edges.
  const markerEffectiveStartX = 49;

  const href = buildPracticeHref(assignment);
  const { progress } = assignment;
  const completionRatio =
    progress.total > 0 ? Math.min(1, progress.answered / progress.total) : 0;
  const ctaLabel =
    assignment.status === "in_progress" ? "Continue" : "Start";
  const attemptsStr = attemptsText(assignment);
  const { label, color, pillBg, pillBorder } =
    getAssignmentModeMeta(assignment.mode);
  const overdue = isAssignmentOverdue(assignment);
  const instructorNote = assignment.instructions?.trim() ?? "";
  const hasInstructorNote = instructorNote.length > 0;

  return (
    <article
      className="overflow-hidden rounded-[28px] sm:rounded-[32px]"
      style={{
        minHeight: 211,
        background: "var(--assignment-glass-bg-strong)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-elevated-shadow)",
      }}
    >
      <div className="flex h-full flex-col items-stretch md:flex-row">

        {/* Left panel — ~72% */}
        <div
          className="flex min-w-0 flex-col justify-center p-5 sm:p-6 md:basis-[72%] md:px-7"
        >
          {/* Top row: due date + mode pill */}
          <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
            <span
              className="inline-flex items-center rounded-full px-3 py-1"
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                letterSpacing: -0.1,
                fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
                fontWeight: 500,
                color,
                background: pillBg,
                border: `1.5px solid ${pillBorder}`,
                boxShadow: "var(--assignment-pill-highlight)",
              }}
            >
              {label}
            </span>
            {assignment.due_date && (
              <div
                className="inline-flex items-center gap-1.5"
                style={{
                  color: overdue
                    ? "var(--assignment-overdue)"
                    : "var(--muted-foreground)",
                }}
              >
                <Calendar style={{ width: 14, height: 14 }} aria-hidden="true" />
                <span
                  style={{
                    fontSize: 15,
                    lineHeight: 1.5,
                    letterSpacing: -0.1,
                    fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
                    fontWeight: 400,
                  }}
                >
                  Due {formatDueDateTime(assignment.due_date)}
                </span>
              </div>
            )}
          </div>

          {/* Title */}
          <h2
            className="font-bold text-heading leading-tight"
            style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.4, fontFamily: "var(--font-geist), ui-sans-serif, sans-serif", color: "var(--foreground)", marginBottom: hasInstructorNote ? 10 : 28 }}
          >
            {assignment.title}
          </h2>

          {hasInstructorNote && (
            <button
              type="button"
              className="flex max-w-full items-start gap-2 text-left text-muted-foreground"
              style={{
                marginBottom: 24,
                paddingLeft: 10,
                borderLeft: "2px solid var(--assignment-panel-border)",
                fontSize: 13,
                lineHeight: 1.45,
                fontStyle: "italic",
                fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
              }}
              aria-expanded={noteExpanded}
              aria-label="Toggle instructor note"
              onClick={() => setNoteExpanded((current) => !current)}
            >
              <MessageCircle
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                aria-hidden="true"
              />
              <span
                className={noteExpanded ? "whitespace-normal" : "truncate"}
                style={{ minWidth: 0 }}
              >
                &ldquo;{instructorNote}&rdquo;
              </span>
            </button>
          )}

          {/* Progress bar + percentage */}
          <div className="flex items-center gap-3">
            <div className="relative" style={{ width: "85%", paddingTop: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/illustrations/Progress 1.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none"
                style={{
                  position: "absolute",
                  width: markerWidth,
                  height: "auto",
                  maxHeight: markerWidth,
                  top: "50%",
                  left: `clamp(${12 - markerEffectiveStartX}px, calc(${completionRatio * 100}% - ${markerEffectiveStartX}px), calc(100% - ${markerEffectiveStartX}px))`,
                  transform: "translateY(-50%)",
                  filter: "var(--assignment-progress-marker-shadow)",
                  transition: "left 300ms ease-out",
                  zIndex: 2,
                }}
              />
              <div
                className="rounded-full overflow-hidden"
                style={{
                  height: 30,
                  background: "var(--surface-muted)",
                  border: "1.5px solid var(--border-default)",
                  boxShadow: "var(--assignment-pill-highlight)",
                }}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full transition-all duration-300 relative"
                  style={{
                    width: `${completionRatio * 100}%`,
                    background: "var(--assignment-progress-fill)",
                  }}
                />
              </div>
            </div>
            <span
              className="flex-shrink-0"
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                letterSpacing: -0.1,
                fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
                fontWeight: 400,
                color: "var(--muted-foreground)",
                minWidth: 36,
                textAlign: "right",
              }}
            >
              {Math.round(completionRatio * 100)}%
            </span>
          </div>
        </div>

        {/* Vertical divider */}
        <div
          className="mx-5 h-px w-auto flex-shrink-0 md:mx-0 md:my-5 md:h-auto md:w-px"
          style={{ background: "var(--border-default)" }}
        />

        {/* Right panel — ~28% */}
        <div
          className="flex flex-shrink-0 flex-col items-center justify-center gap-0 p-5 sm:p-6 md:basis-[28%]"
        >
          {/* Questions · attempts */}
          <p
            className="text-muted-foreground text-center"
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              letterSpacing: -0.1,
              fontFamily: "var(--font-inter), ui-sans-serif, sans-serif",
              fontWeight: 400,
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            {progress.total > 0 ? `${progress.total} questions` : ""}
            {progress.total > 0 && <br />}
            {attemptsStr}
          </p>

          {/* CTA */}
          <Link
            href={href}
            className="w-full flex items-center justify-center rounded-xl font-bold transition duration-200 hover:brightness-110 active:brightness-95"
            style={{
              fontSize: 16,
              letterSpacing: "0.3px",
              wordSpacing: "1px",
              height: 46,
              borderRadius: 999,
              color: "var(--assignment-cta-text)",
              background: "var(--assignment-cta-bg-strong)",
              border: "1.5px solid var(--assignment-glass-border)",
              boxShadow: "var(--assignment-cta-elevated-shadow)",
            }}
          >
            {ctaLabel}
          </Link>
        </div>

      </div>
    </article>
  );
}
