"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { formatDueDateTime } from "@/lib/due-date";

// --- Progress ring constants ---
const RING_SIZE = 96;
const RING_STROKE = 7;
const RING_R = (RING_SIZE - RING_STROKE) / 2; // 44.5
const RING_C = 2 * Math.PI * RING_R; // ≈ 279.6

function ProgressRing({
  completionRatio,
  accuracy,
}: {
  completionRatio: number; // 0–1
  accuracy: number | null; // null → not_started → show Play icon
}) {
  const ratio = Math.min(1, Math.max(0, completionRatio));
  const offset = RING_C * (1 - ratio);

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          fill="none"
          strokeWidth={RING_STROKE}
          style={{ stroke: "var(--surface-muted)" }}
        />
        {/* Progress arc */}
        {ratio > 0 && (
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_R}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
            style={{ stroke: "var(--primary)" }}
            className="transition-all duration-300"
          />
        )}
      </svg>
      {/* Center overlay — not rotated */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {accuracy === null ? (
          <Play
            className="w-6 h-6"
            style={{ color: "var(--muted-foreground)" }}
            aria-hidden="true"
          />
        ) : (
          <>
            <span
              className="text-2xl font-semibold leading-none"
              style={{ color: "var(--heading)" }}
            >
              {accuracy}%
            </span>
            <span
              className="text-xs mt-0.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              accuracy
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// --- Helpers ---

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

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const t = new Date(dueDate).getTime();
  return Number.isFinite(t) && t < Date.now();
}

function eyebrowText(
  assignment: StudentAssignmentListItem,
): { base: string; overdue: boolean } {
  const modeLabel = assignment.mode.toUpperCase();
  const { max_attempts, completed_attempts, status } = assignment;
  const showAttempt =
    max_attempts != null || completed_attempts > 0 || status === "in_progress";

  let base = modeLabel;
  if (showAttempt) {
    const current = completed_attempts + 1;
    const max = max_attempts != null ? String(max_attempts) : "∞";
    base += ` · ATTEMPT ${current} OF ${max}`;
  }
  return { base, overdue: isOverdue(assignment.due_date) };
}

function sublineText(assignment: StudentAssignmentListItem): string {
  const { progress, mode, status } = assignment;
  const parts: string[] = [];

  if (status === "in_progress" && progress.total > 0) {
    const totalLabel =
      mode === "review" ? `up to ${progress.total}` : String(progress.total);
    parts.push(`${progress.answered} of ${totalLabel} answered`);
  } else if (progress.total > 0) {
    const totalLabel =
      mode === "review" ? `up to ${progress.total}` : String(progress.total);
    parts.push(`${totalLabel} questions`);
  }

  if (assignment.due_date) {
    parts.push(`Due ${formatDueDateTime(assignment.due_date)}`);
  }

  return parts.join(" · ");
}

// --- Component ---

export function NextStepCard({
  assignment,
}: {
  assignment: StudentAssignmentListItem;
}) {
  const href = buildPracticeHref(assignment);
  const { base: eyebrow, overdue } = eyebrowText(assignment);
  const subline = sublineText(assignment);

  const { progress } = assignment;
  const completionRatio =
    progress.total > 0
      ? Math.min(1, progress.answered / progress.total)
      : 0;

  const ctaLabel =
    assignment.status === "in_progress" ? "Continue" : "Start";

  return (
    <article
      className="rounded-2xl border border-border-default bg-surface shadow-sm"
      style={{ padding: "20px 24px" }}
    >
      <div className="flex items-center gap-5">
        <ProgressRing
          completionRatio={completionRatio}
          accuracy={assignment.accuracy}
        />

        <div className="flex-1 min-w-0">
          {/* Eyebrow */}
          <p
            className="font-medium uppercase text-muted-foreground mb-1.5"
            style={{ fontSize: 12, letterSpacing: "0.4px" }}
          >
            {eyebrow}
            {overdue && (
              <span style={{ color: "var(--error-color)" }}> · OVERDUE</span>
            )}
          </p>

          {/* Title */}
          <h2
            className="font-semibold text-heading leading-snug mb-1"
            style={{ fontSize: 20 }}
          >
            {assignment.title}
          </h2>

          {/* Subline */}
          {subline && (
            <p
              className="text-muted-foreground mb-3"
              style={{ fontSize: 13 }}
            >
              {subline}
            </p>
          )}

          {/* CTA */}
          <Link
            href={href}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
            style={{ fontSize: 15, borderRadius: 8 }}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}
