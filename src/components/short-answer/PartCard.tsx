"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import type { GradedFeedback, ShortAnswerPart } from "@/types/short-answer";
import { HIGHLIGHT_ZONE_ATTR } from "@/lib/short-answer/highlight";
import { FeedbackBlock } from "./FeedbackBlock";
import type { AttemptHistoryEntry } from "./AttemptHistoryModal";

export type PartStatus = "locked" | "active" | "submitting" | "resolved";

interface PartCardProps {
  part: ShortAnswerPart;
  index: number;
  status: PartStatus;
  attempts: AttemptHistoryEntry[];
  maxAttempts: number;
  /** Feedback shown under the textarea for the latest attempt (null in exam). */
  latestFeedback: GradedFeedback | null;
  triesLeft: number;
  /** Set when the part just resolved and the next part should unlock after 3s. */
  unlock?: { label: string; onUnlock: () => void };
  reported: boolean;
  initialValue?: string;
  onCheck: (response: string) => void;
  onOpenAttempt: (attempt: AttemptHistoryEntry) => void;
  onReport: () => void;
  onGlossaryClick: (term: string, event: React.MouseEvent) => void;
}

const BADGE_COLORS: Record<string, string> = {
  A: "bg-[var(--assignment-mode-practice-bg)] text-[color:var(--assignment-mode-practice)]",
  B: "bg-[var(--assignment-mode-review-bg)] text-[color:var(--assignment-mode-review)]",
  C: "bg-[var(--assignment-mode-exam-bg)] text-[color:var(--assignment-mode-exam)]",
};

export function PartCard({
  part,
  index,
  status,
  attempts,
  maxAttempts,
  latestFeedback,
  triesLeft,
  unlock,
  reported,
  initialValue = "",
  onCheck,
  onOpenAttempt,
  onReport,
  onGlossaryClick,
}: PartCardProps) {
  const [value, setValue] = useState("");
  const locked = status === "locked";
  const submitting = status === "submitting";
  const resolved = status === "resolved";
  const canType = status === "active";
  const isFinalAttempt = attempts.length >= maxAttempts;

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, part.label]);

  return (
    <section
      aria-label={`Part ${part.label}`}
      className={`rounded-2xl border p-4 sm:p-5 transition ${
        locked
          ? "border-[color:var(--assignment-panel-border)] bg-black/[0.02] opacity-70"
          : "border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] backdrop-blur-md"
      }`}
      style={!locked ? { boxShadow: "var(--assignment-card-shadow)" } : undefined}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              locked ? "bg-slate-200 text-slate-500" : BADGE_COLORS[part.label]
            }`}
          >
            {resolved ? "✓" : part.label}
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
              Part {part.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Attempt dots */}
          <div
            className="flex items-center gap-1.5"
            aria-label="Attempt history"
            data-tour={`part-${part.label}-dots`}
          >
            {Array.from({ length: maxAttempts }).map((_, i) => {
              const attempt = attempts[i];
              const scored = Boolean(attempt);
              const label = scored
                ? `Attempt ${i + 1} — ${attempt!.correct ? "correct" : "incorrect"}`
                : `Attempt ${i + 1} — not yet used`;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={label}
                  title={label}
                  disabled={!scored}
                  onClick={() => scored && onOpenAttempt(attempt!)}
                  className={`h-2.5 w-2.5 rounded-full transition ${
                    scored
                      ? `${attempt!.correct ? "bg-emerald-500" : "bg-rose-500"} cursor-pointer hover:scale-125`
                      : "cursor-default bg-slate-300"
                  }`}
                />
              );
            })}
          </div>

          {!locked && (
            <button
              type="button"
              onClick={onReport}
              data-tour={`part-${part.label}-report`}
              disabled={reported || attempts.length === 0}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                reported
                  ? "bg-rose-100 text-rose-700"
                  : "text-[color:var(--foreground)]/55 hover:bg-black/5 disabled:opacity-40"
              }`}
            >
              {reported ? "Reported" : "Report"}
            </button>
          )}
        </div>
      </header>

      <p
        {...{ [HIGHLIGHT_ZONE_ATTR]: "" }}
        className="mt-3 text-[15px] leading-relaxed text-[color:var(--foreground)]"
        data-tour={`part-${part.label}-prompt`}
      >
        {part.prompt}
      </p>

      {locked ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-[color:var(--foreground)]/50">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Finish Part {index > 0 ? String.fromCharCode(64 + index) : "above"} first
        </p>
      ) : (
        <div className="mt-3">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canType}
            maxLength={part.maxLength}
            rows={3}
            placeholder="Type your answer…"
            aria-label={`Answer for Part ${part.label}`}
            className="w-full resize-none rounded-xl border border-[color:var(--assignment-panel-border)] bg-white/70 px-3 py-2 text-[14px] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] text-[color:var(--foreground)]/40">
              {value.length}/{part.maxLength}
            </span>
            {!resolved && (
              <button
                type="button"
                onClick={() => onCheck(value)}
                disabled={value.trim().length === 0 || submitting || !canType}
                className="rounded-full bg-[color:var(--assignment-cta-bg-strong)] px-5 py-1.5 text-sm font-semibold text-[color:var(--assignment-cta-text)] transition hover:bg-[color:var(--assignment-cta-bg-hover)] disabled:opacity-50"
              >
                {submitting ? "Checking…" : "Check"}
              </button>
            )}
          </div>

          {latestFeedback && (
            <FeedbackBlock
              feedback={latestFeedback}
              triesLeft={triesLeft}
              isFinalAttempt={isFinalAttempt}
              unlock={unlock}
              onGlossaryClick={onGlossaryClick}
            />
          )}
        </div>
      )}
    </section>
  );
}
