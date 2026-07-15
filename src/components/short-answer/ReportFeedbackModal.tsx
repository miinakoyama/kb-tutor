"use client";

import { useEffect, useState } from "react";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

interface ReportFeedbackModalProps {
  partLabel: string;
  attemptId: string;
  questionId: string;
  onClose: () => void;
  onReported: () => void;
}

/** "Report feedback — Part X" modal. POSTs to /api/feedback-reports. */
export function ReportFeedbackModal({
  partLabel,
  attemptId,
  questionId,
  onClose,
  onReported,
}: ReportFeedbackModalProps) {
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

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          questionId,
          partLabel,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok && res.status !== 409) {
        throw new Error("Failed to send report");
      }
      onReported();
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
        aria-label={`Report feedback for Part ${partLabel}`}
        className="w-full max-w-md rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg-strong)] p-5 backdrop-blur-md"
        style={{ boxShadow: "var(--assignment-elevated-shadow)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
          Report feedback — Part {partLabel}
        </h3>
        <p className="mt-2 text-[13px] text-[color:var(--foreground)]/70">
          Think the AI feedback is wrong or confusing? Your teacher will review it.
        </p>

        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
          What seems wrong? (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1 w-full resize-none rounded-xl border border-[color:var(--assignment-panel-border)] bg-white/70 px-3 py-2 text-[13px] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-[var(--assignment-progress-fill)]/60"
        />

        {error && <p className="mt-2 text-[12px] text-error">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-[color:var(--foreground)]/70 transition hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-full bg-[color:var(--assignment-cta-bg-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--assignment-cta-text)] transition hover:bg-[color:var(--assignment-cta-bg-hover)] disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send to teacher"}
          </button>
        </div>
      </div>
    </div>
  );
}
