"use client";

import { useEffect, useState } from "react";
import type { GradedFeedback } from "@/types/short-answer";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

interface ReportFeedbackModalProps {
  targets: Array<{
    partLabel: string;
    attemptId: string;
    attemptNumber: number;
    feedback: GradedFeedback;
    reported: boolean;
  }>;
  questionId: string;
  onClose: () => void;
  onReported: (attemptId: string) => void;
}

/** Reports any recorded part attempt from one selectable, previewable form. */
export function ReportFeedbackModal({
  targets,
  questionId,
  onClose,
  onReported,
}: ReportFeedbackModalProps) {
  const [selectedAttemptId, setSelectedAttemptId] = useState(() => {
    const latestUnreported = [...targets].reverse().find((target) => !target.reported);
    return latestUnreported?.attemptId ?? targets[targets.length - 1]?.attemptId ?? "";
  });
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialogFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedTarget = targets.find(
    (target) => target.attemptId === selectedAttemptId,
  );

  const submit = async () => {
    if (!selectedTarget) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: selectedTarget.attemptId,
          questionId,
          partLabel: selectedTarget.partLabel,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok && res.status !== 409) {
        throw new Error("Failed to send report");
      }
      onReported(selectedTarget.attemptId);
      onClose();
    } catch {
      setError("Could not send your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
        aria-label="Report feedback"
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border p-5 backdrop-blur-md"
        style={{
          background: "var(--assignment-glass-bg-strong)",
          borderColor: "var(--assignment-glass-border)",
          boxShadow: "var(--assignment-elevated-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
          Report feedback
        </h3>
        <p className="mt-2 text-[13px] text-[color:var(--foreground)]/70">
          Choose the feedback that seems wrong or confusing. Your teacher will review it.
        </p>

        <label
          htmlFor="feedback-report-target"
          className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45"
        >
          Feedback to report
        </label>
        <select
          id="feedback-report-target"
          value={selectedAttemptId}
          onChange={(event) => {
            setSelectedAttemptId(event.target.value);
            setError(null);
          }}
          className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          style={{
            background: "var(--surface)",
            borderColor: "var(--assignment-panel-border)",
          }}
        >
          {targets.map((target) => (
            <option
              key={target.attemptId}
              value={target.attemptId}
              disabled={target.reported}
            >
              Part {target.partLabel} · Attempt {target.attemptNumber}
              {target.reported ? " — Reported" : ""}
            </option>
          ))}
        </select>

        {selectedTarget && (
          <div
            aria-live="polite"
            className="mt-3 rounded-2xl border p-4"
            style={{
              background: "var(--surface-muted)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
              Feedback received
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {selectedTarget.feedback.segments.map((segment, index) => (
                <div key={index}>
                  {segment.label.trim().length > 0 && (
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
                      {segment.label}
                    </p>
                  )}
                  <p className="text-[13px] leading-relaxed text-[color:var(--foreground)]/80">
                    {segment.text}
                  </p>
                </div>
              ))}
              {selectedTarget.feedback.modelAnswer && (
                <div
                  className="border-t pt-2"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
                    Model answer
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--foreground)]/80">
                    {selectedTarget.feedback.modelAnswer}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <label
          htmlFor="feedback-report-note"
          className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45"
        >
          What seems wrong? (optional)
        </label>
        <textarea
          id="feedback-report-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="mt-1 w-full resize-none rounded-xl border px-3 py-2 text-[13px] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          style={{
            background: "var(--surface)",
            borderColor: "var(--assignment-panel-border)",
          }}
        />

        {error && <p className="mt-2 text-[12px] text-error">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-[color:var(--foreground)]/70 transition hover:bg-[var(--surface-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !selectedTarget || selectedTarget.reported}
            className="rounded-full border px-4 py-2 text-sm font-semibold transition hover:brightness-110 disabled:opacity-60"
            style={{
              background: "var(--assignment-cta-bg-strong)",
              borderColor: "var(--assignment-glass-border)",
              color: "var(--assignment-cta-text)",
            }}
          >
            {submitting ? "Sending…" : "Send to teacher"}
          </button>
        </div>
      </div>
    </div>
  );
}
