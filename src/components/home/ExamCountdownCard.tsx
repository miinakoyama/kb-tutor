"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { daysUntilExam, type KeystoneExamInfo } from "@/lib/keystone-exam";
import { saveKeystoneExamDateToDb } from "@/lib/keystone-exam-settings";

/**
 * Tall countdown card for the "Your progress" row, drawn on the fixed
 * Countdown illustration. The illustration is light in both themes (an
 * "illustration island", like the assignments-page mascot PNG), so the text
 * on it uses fixed dark ink — theme tokens would flip light in dark mode
 * and vanish against the artwork.
 *
 * The calendar button opens an editor for the student's *personal* exam
 * date (user_settings.keystone_exam_date). The school-level date is
 * admin-managed and stays untouched; a personal date only overrides this
 * student's countdown.
 */

/** Fixed ink for text sitting on the light illustration (both themes). */
const INK = "#1f2d1f";

function todayYmdLocal(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function ExamCountdownCard({ exam }: { exam: KeystoneExamInfo }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draftDate, setDraftDate] = useState(exam.examDate);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const days = daysUntilExam(exam.examDate);
  if (days === null || days < 0) return null;

  const openEditor = () => {
    setDraftDate(exam.examDate);
    setSaveFailed(false);
    setIsEditing(true);
  };

  const closeEditor = () => {
    setIsEditing(false);
    triggerRef.current?.focus();
  };

  const save = async (value: string | null) => {
    setIsSaving(true);
    setSaveFailed(false);
    const ok = await saveKeystoneExamDateToDb(value);
    setIsSaving(false);
    if (!ok) {
      setSaveFailed(true);
      return;
    }
    setIsEditing(false);
    // Re-runs the server component so the countdown reflects the new date.
    router.refresh();
  };

  return (
    <section
      aria-label="Keystone exam countdown"
      className="relative flex h-full flex-col overflow-hidden rounded-[24px] p-5 sm:p-6"
      style={{
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-card-shadow)",
        backgroundImage: "url('/illustrations/Countdown.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Frosted-glass wash over the illustration — it blurs the card's own
          background image, letting the artwork show through softly. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "rgba(255, 255, 255, 0.2)",
          backdropFilter: "blur(1px) saturate(120%)",
          WebkitBackdropFilter: "blur(1px) saturate(120%)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: INK }}
        >
          My Exam Date
        </span>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (isEditing ? closeEditor() : openEditor())}
          aria-expanded={isEditing}
          aria-label="Change exam date"
          title="Change exam date"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          style={{
            background: "rgba(255, 255, 255, 0.85)",
            border: "1px solid rgba(255, 255, 255, 0.9)",
          }}
        >
          <CalendarDays className="h-4 w-4" style={{ color: INK }} />
        </button>
      </div>

      <div className="relative flex flex-1 flex-col justify-center py-6">
        {days === 0 ? (
          <p className="font-heading text-3xl font-extrabold" style={{ color: INK }}>
            Exam day
          </p>
        ) : (
          <>
            <p
              className="font-heading font-extrabold leading-none"
              style={{ fontSize: 56, letterSpacing: -1, color: INK }}
            >
              {days}
            </p>
            <p className="mt-1 font-heading text-xl font-bold" style={{ color: INK }}>
              {days === 1 ? "day to go" : "days to go"}
            </p>
          </>
        )}
      </div>

      {isEditing && (
        <>
          {/* Click-away dismissal */}
          <button
            type="button"
            aria-label="Close date editor"
            className="fixed inset-0 z-10 cursor-default"
            onClick={closeEditor}
          />
          <div
            role="dialog"
            aria-label="Change exam date"
            className="absolute right-4 top-16 z-20 flex w-56 flex-col gap-3 rounded-2xl p-4"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--assignment-glass-border)",
              boxShadow: "var(--assignment-popover-shadow)",
            }}
          >
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              My exam date
              <input
                type="date"
                value={draftDate}
                min={todayYmdLocal()}
                onChange={(event) => setDraftDate(event.target.value)}
                className="rounded-lg px-2.5 py-2 text-sm font-normal text-slate-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                style={{
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border-default)",
                }}
              />
            </label>

            {saveFailed && (
              <p className="text-xs text-error">Could not save. Please try again.</p>
            )}

            <div className="flex items-center justify-between gap-2">
              {exam.source === "personal" ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void save(null)}
                  className="text-xs font-semibold text-muted-foreground transition hover:brightness-110 disabled:opacity-50"
                >
                  Use school date
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={isSaving || !draftDate}
                onClick={() => void save(draftDate)}
                className="rounded-full px-4 py-1.5 text-xs font-bold transition hover:bg-[var(--assignment-row-cta-bg-hover)] disabled:opacity-50"
                style={{
                  color: "var(--assignment-row-cta-text)",
                  background: "var(--assignment-row-cta-bg)",
                  border: "1.5px solid var(--assignment-row-cta-border)",
                  boxShadow: "var(--assignment-row-cta-shadow)",
                }}
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
