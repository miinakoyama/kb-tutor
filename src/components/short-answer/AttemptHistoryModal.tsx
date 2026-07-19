"use client";

import { useEffect } from "react";
import type { GradedFeedback } from "@/types/short-answer";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

export interface AttemptHistoryEntry {
  attemptId: string;
  attemptNumber: number;
  correct: boolean;
  score: number;
  maxScore: number;
  responseText: string;
  feedback: GradedFeedback;
}

interface AttemptHistoryModalProps {
  partLabel: string;
  attempt: AttemptHistoryEntry;
  onClose: () => void;
}

export function AttemptHistoryModal({
  partLabel,
  attempt,
  onClose,
}: AttemptHistoryModalProps) {
  const dialogRef = useDialogFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Part ${partLabel}, attempt ${attempt.attemptNumber}`}
        className="w-full max-w-md rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg-strong)] p-5 backdrop-blur-md"
        style={{ boxShadow: "var(--assignment-elevated-shadow)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
            Part {partLabel} · Attempt {attempt.attemptNumber}
          </h3>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              attempt.correct
                ? "bg-[var(--mastery-mastered-bg)] text-[var(--mastery-mastered)]"
                : "bg-error-light text-error"
            }`}
          >
            {attempt.correct ? "Correct" : "Incorrect"}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
              You wrote
            </span>
            <p className="mt-1 whitespace-pre-wrap rounded-xl bg-white/60 px-3 py-2 text-[13px] italic text-[color:var(--foreground)]/80">
              “{attempt.responseText || "(no response)"}”
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
              Feedback
            </span>
            {attempt.feedback.segments.map((segment, i) => (
              <p key={i} className="text-[13px] text-[color:var(--foreground)]/80">
                {segment.label.trim().length > 0 ? (
                  <>
                    <span className="font-semibold">{segment.label}:</span> {segment.text}
                  </>
                ) : (
                  segment.text
                )}
              </p>
            ))}
            {attempt.feedback.modelAnswer && (
              <p className="text-[13px] text-[color:var(--foreground)]/80">
                <span className="font-semibold">Model answer:</span>{" "}
                {attempt.feedback.modelAnswer}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-[color:var(--assignment-cta-bg-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--assignment-cta-text)] transition hover:bg-[color:var(--assignment-cta-bg-hover)]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
