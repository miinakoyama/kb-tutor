"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import type { GradedFeedback } from "@/types/short-answer";
import { HIGHLIGHT_ZONE_ATTR } from "@/lib/short-answer/highlight";
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
    border: "border-[var(--assignment-completed-muted)]",
    bg: "bg-[var(--mastery-mastered-bg)]",
    text: "text-[var(--mastery-mastered)]",
  },
  incorrect: {
    border: "border-[var(--border-default)]",
    bg: "bg-[var(--assignment-mode-review-bg)]/30",
    text: "text-[var(--assignment-mode-review)]",
  },
  neutral: {
    border: "border-[var(--border-default)]",
    bg: "bg-[var(--surface-muted)]",
    text: "text-slate-gray",
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
      className="flex items-center justify-center gap-2 border-t border-[var(--assignment-completed-muted)] bg-[var(--mastery-mastered-bg)] px-4 py-2 text-sm font-semibold text-[var(--mastery-mastered)]"
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
  // The model answer is dense reference text, so it stays collapsed behind an
  // explicit click (not hover — that fails on touch and hides the key content).
  const [showModelAnswer, setShowModelAnswer] = useState(false);

  return (
    <div
      className={`mt-3 overflow-hidden rounded-2xl border ${tone.border} ${tone.bg}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-1">
        <span className={`flex items-center gap-2 text-[15px] font-semibold ${tone.text}`}>
          {display.glyph === "✗" ? (
            <Lightbulb className="h-4 w-4" aria-hidden />
          ) : (
            <span aria-hidden>{display.glyph}</span>
          )}
          {display.phrase}
        </span>
        {triesLeft > 0 && (
          <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--foreground)]/70">
            {triesLeft} {triesLeft === 1 ? "try" : "tries"} left
          </span>
        )}
      </div>

      {feedback.segments.length > 0 && (
        <div
          {...{ [HIGHLIGHT_ZONE_ATTR]: "" }}
          className="flex flex-col gap-3 px-4 pt-1 pb-3"
        >
          {feedback.segments.map((segment, i) => (
            <div key={i} className="flex flex-col gap-1">
              {segment.label.trim().length > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
                  {segment.label}
                </span>
              )}
              <p className="text-[15px] leading-relaxed text-[color:var(--foreground)]/85">
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
        <div
          className={`px-4 pb-3 ${feedback.segments.length > 0 ? "pt-2" : "pt-1"}`}
        >
          <button
            type="button"
            onClick={() => setShowModelAnswer((prev) => !prev)}
            aria-expanded={showModelAnswer}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/50 transition-colors hover:text-[color:var(--foreground)]/75"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showModelAnswer ? "rotate-180" : ""}`}
              aria-hidden
            />
            {showModelAnswer ? "Hide model answer" : "Show model answer"}
          </button>
          {showModelAnswer && (
            <p
              {...{ [HIGHLIGHT_ZONE_ATTR]: "" }}
              className="mt-1.5 text-[15px] leading-relaxed text-[color:var(--foreground)]/75"
            >
              {feedback.modelAnswer}
            </p>
          )}
        </div>
      )}

      {unlock && <UnlockCountdown label={unlock.label} onUnlock={unlock.onUnlock} />}
    </div>
  );
}
