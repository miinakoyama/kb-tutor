"use client";

import { useEffect, useRef, useState } from "react";
import type { GradedFeedback } from "@/types/short-answer";
import { verdictDisplay } from "./verdict-display";

interface FeedbackBlockProps {
  feedback: GradedFeedback;
  triesLeft: number;
  isFinalAttempt: boolean;
  /** When set, an unlock countdown bar appears and calls onUnlock at 0. */
  unlock?: { label: string; onUnlock: () => void };
  onGlossaryClick?: (term: string, event: React.MouseEvent) => void;
}

const TONE_STYLES: Record<
  "correct" | "incorrect" | "neutral",
  { border: string; bg: string; text: string }
> = {
  correct: {
    border: "border-emerald-300",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
  },
  incorrect: {
    border: "border-rose-300",
    bg: "bg-rose-50",
    text: "text-rose-800",
  },
  neutral: {
    border: "border-slate-300",
    bg: "bg-slate-50",
    text: "text-slate-700",
  },
};

function UnlockCountdown({
  label,
  onUnlock,
}: {
  label: string;
  onUnlock: () => void;
}) {
  const [count, setCount] = useState(3);
  const unlockedRef = useRef(false);
  const onUnlockRef = useRef(onUnlock);

  useEffect(() => {
    onUnlockRef.current = onUnlock;
  }, [onUnlock]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (count !== 0 || unlockedRef.current) return;
    unlockedRef.current = true;
    onUnlockRef.current();
  }, [count]);

  return (
    <div
      className="flex items-center justify-center gap-2 border-t border-emerald-200 bg-emerald-100/70 px-4 py-2 text-sm font-semibold text-emerald-800"
      aria-live="polite"
    >
      {label} {count}…
    </div>
  );
}

export function FeedbackBlock({
  feedback,
  triesLeft,
  isFinalAttempt,
  unlock,
  onGlossaryClick,
}: FeedbackBlockProps) {
  const display = verdictDisplay(feedback.verdict, isFinalAttempt);
  const tone = TONE_STYLES[display.tone];

  return (
    <div
      className={`mt-3 overflow-hidden rounded-2xl border ${tone.border} ${tone.bg}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center justify-between gap-3 border-b ${tone.border} px-4 py-2`}
      >
        <span className={`flex items-center gap-2 text-sm font-semibold ${tone.text}`}>
          <span aria-hidden>{display.glyph}</span>
          {display.phrase}
        </span>
        {triesLeft > 0 && (
          <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--foreground)]/70">
            {triesLeft} {triesLeft === 1 ? "try" : "tries"} left
          </span>
        )}
      </div>

      {feedback.segments.length > 0 && (
        <div className="flex flex-col gap-3 px-4 py-3">
          {feedback.segments.map((segment, i) => (
            <div key={i} className="flex flex-col gap-1">
              {segment.label.trim().length > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
                  {segment.label}
                </span>
              )}
              <p className="text-[13px] leading-relaxed text-[color:var(--foreground)]/85">
                {segment.text}
              </p>
            </div>
          ))}

          {feedback.glossaryTerms && feedback.glossaryTerms.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {feedback.glossaryTerms.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={(e) => onGlossaryClick?.(term, e)}
                  className="rounded-full border border-[color:var(--assignment-panel-border)] bg-white/70 px-3 py-1 text-[11px] font-medium text-[color:var(--foreground)]/75 transition hover:bg-white"
                >
                  {term}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {feedback.modelAnswer && (
        <p className="px-4 py-3 text-[12.5px] leading-relaxed text-[color:var(--foreground)]/75">
          {feedback.modelAnswer}
        </p>
      )}

      {unlock && <UnlockCountdown label={unlock.label} onUnlock={unlock.onUnlock} />}
    </div>
  );
}
