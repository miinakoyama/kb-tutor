"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Lock } from "lucide-react";
import type { GradedFeedback, PartLabel, ShortAnswerPart } from "@/types/short-answer";
import { HIGHLIGHT_ZONE_ATTR } from "@/lib/short-answer/highlight";
import { FeedbackBlock } from "./FeedbackBlock";
import type { AttemptHistoryEntry } from "./AttemptHistoryModal";

export type PartStatus = "locked" | "active" | "submitting" | "resolved";

interface PartCardProps {
  part: ShortAnswerPart;
  status: PartStatus;
  attempts: AttemptHistoryEntry[];
  maxAttempts: number;
  /** Feedback shown under the textarea for the latest attempt (null in exam). */
  latestFeedback: GradedFeedback | null;
  triesLeft: number;
  /** Set when the part just resolved and the next part should unlock after 3s. */
  unlock?: { label: string; onUnlock: () => void };
  initialValue?: string;
  checkDisabled?: boolean;
  /** Label of the preceding part, used for the locked row's unlock condition. */
  previousLabel?: PartLabel;
  onCheck: (response: string) => void;
  onOpenAttempt: (attempt: AttemptHistoryEntry) => void;
  onGlossaryClick: (term: string, event: React.MouseEvent) => void;
}

function AttemptDots({
  label,
  attempts,
  maxAttempts,
  onOpenAttempt,
}: {
  label: PartLabel;
  attempts: AttemptHistoryEntry[];
  maxAttempts: number;
  onOpenAttempt: (attempt: AttemptHistoryEntry) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label="Attempt history"
      data-tour={`part-${label}-dots`}
    >
      {Array.from({ length: maxAttempts }).map((_, i) => {
        const attempt = attempts[i];
        const scored = Boolean(attempt);
        const dotLabel = scored
          ? `Attempt ${i + 1} — ${attempt!.correct ? "correct" : "incorrect"}`
          : `Attempt ${i + 1} — not yet used`;
        return (
          <button
            key={i}
            type="button"
            aria-label={dotLabel}
            title={dotLabel}
            disabled={!scored}
            onClick={() => scored && onOpenAttempt(attempt!)}
            className={`h-2.5 w-2.5 rounded-full transition ${
              scored
                ? `${attempt!.correct ? "bg-[var(--assignment-progress-fill)]/60" : "bg-[#F4C961]"} cursor-pointer hover:scale-125`
                : "cursor-default bg-[var(--border-default)]"
            }`}
          />
        );
      })}
    </div>
  );
}

const CARD_CLASS =
  "rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] backdrop-blur-md p-4 sm:p-5";
const CARD_SHADOW = { boxShadow: "var(--assignment-card-shadow)" };
const CONTENT_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

export function PartCard({
  part,
  status,
  attempts,
  maxAttempts,
  latestFeedback,
  triesLeft,
  unlock,
  initialValue = "",
  checkDisabled = false,
  previousLabel,
  onCheck,
  onOpenAttempt,
  onGlossaryClick,
}: PartCardProps) {
  const [value, setValue] = useState("");
  // Manual expand/collapse for an already-completed part. Forced open while
  // its unlock countdown is running so the student can read feedback before
  // it auto-collapses and the next part becomes current.
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const locked = status === "locked";
  const submitting = status === "submitting";
  const resolved = status === "resolved";
  const canType = status === "active";
  const isFinalAttempt = attempts.length >= maxAttempts;
  const expanded = Boolean(unlock) || manuallyExpanded;

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, part.label]);

  // Focus follows the current part: fires on the initial "become active"
  // transition and again after every retry attempt. preventScroll avoids
  // fighting with the explicit scrollIntoView the parent runs on unlock.
  // On a retry (an attempt already exists), the previous answer is also
  // selected so the student can start typing straight over it. The select()
  // is deferred a frame because the `setValue(initialValue)` effect above
  // hasn't committed the new DOM value yet in this same pass — selecting
  // immediately would select the stale value.
  useEffect(() => {
    if (status !== "active") return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (attempts.length > 0) {
      const frame = requestAnimationFrame(() => el.select());
      return () => cancelAnimationFrame(frame);
    }
  }, [status, attempts.length]);

  // A single persistent card shell (never remounted) so Framer Motion's
  // `layout` animates the height/position change smoothly as the part
  // moves between locked → current → collapsed-resolved, instead of the
  // three states cross-fading as separate elements.
  return (
    <motion.section
      layout
      transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
      aria-label={`Part ${part.label}`}
      className={
        locked
          ? "scroll-mt-4 rounded-2xl border border-[color:var(--assignment-panel-border)] bg-black/[0.02] p-4 opacity-70 sm:p-5"
          : `scroll-mt-4 ${CARD_CLASS}`
      }
      style={!locked ? CARD_SHADOW : undefined}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {locked ? (
          // Locked parts show their full prompt (never truncated) with no
          // response controls — visually secondary via the faded shell.
          <motion.div key="locked" {...CONTENT_FADE}>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/55">
              Part {part.label}
            </span>
            <p className="mt-2 whitespace-pre-wrap text-[16px] leading-relaxed text-[color:var(--foreground)]">
              {part.prompt}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-[color:var(--foreground)]/55">
              <Lock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              {previousLabel ? `Complete Part ${previousLabel} to answer` : "Locked"}
            </p>
          </motion.div>
        ) : resolved ? (
          // Completed parts collapse into a compact summary once their
          // unlock countdown finishes. Clicking it re-expands to review the
          // response and feedback without changing which part is current.
          <motion.div key="resolved" {...CONTENT_FADE}>
            {/* Attempt tracking stays next to the "Part X" label whether
                the card is collapsed or expanded — not hidden until expanded. */}
            <div className="flex items-start justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/55">
                Part {part.label}
              </span>
              <div className="flex items-center gap-2">
                <AttemptDots
                  label={part.label}
                  attempts={attempts}
                  maxAttempts={maxAttempts}
                  onOpenAttempt={onOpenAttempt}
                />
                <button
                  type="button"
                  onClick={() => setManuallyExpanded((prev) => !prev)}
                  aria-expanded={expanded}
                  aria-label={expanded ? "Collapse" : "Expand"}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-muted-foreground"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setManuallyExpanded((prev) => !prev)}
              className="mt-1 block w-full text-left"
            >
              <p
                className={`text-[16px] leading-relaxed text-[color:var(--foreground)] ${
                  expanded ? "whitespace-pre-wrap" : "truncate"
                }`}
              >
                {part.prompt}
              </p>
              {!expanded && value && (
                <p className="mt-1 truncate text-sm text-muted-foreground">{value}</p>
              )}
            </button>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex flex-col gap-3">
                    <div
                      className="whitespace-pre-wrap rounded-xl border px-3 py-2 text-[15px] leading-relaxed text-[color:var(--foreground)]"
                      style={{
                        borderColor: "var(--assignment-panel-border)",
                        background: "var(--surface-muted)",
                      }}
                    >
                      {value || "—"}
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
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          // Current part: full prompt + response controls.
          <motion.div key="current" {...CONTENT_FADE}>
            <header className="flex items-start justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/55">
                Part {part.label}
              </span>
              <AttemptDots
                label={part.label}
                attempts={attempts}
                maxAttempts={maxAttempts}
                onOpenAttempt={onOpenAttempt}
              />
            </header>

            <p
              {...{ [HIGHLIGHT_ZONE_ATTR]: "" }}
              className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed text-[color:var(--foreground)]"
              data-tour={`part-${part.label}-prompt`}
            >
              {part.prompt}
            </p>

            <div className="mt-3">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!canType}
                maxLength={part.maxLength}
                rows={3}
                placeholder={attempts.length > 0 ? "Type to try again…" : "Type your answer…"}
                aria-label={`Answer for Part ${part.label}`}
                // Highlighted as soon as this part becomes current — not
                // only once the student clicks in. The focus ring/border
                // layer on top is the separate "actively typing" state.
                className="w-full resize-none rounded-xl border-2 border-[color:var(--assignment-progress-fill)] bg-white/70 px-3 py-2 text-[15px] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-[var(--assignment-completed)] disabled:opacity-60"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-[color:var(--foreground)]/40">
                  {value.length}/{part.maxLength}
                </span>
                <button
                  type="button"
                  onClick={() => onCheck(value)}
                  disabled={value.trim().length === 0 || submitting || !canType || checkDisabled}
                  className="rounded-full bg-[color:var(--assignment-cta-bg-strong)] px-5 py-1.5 text-sm font-semibold text-[color:var(--assignment-cta-text)] transition hover:bg-[color:var(--assignment-cta-bg-hover)] disabled:opacity-50"
                >
                  {submitting ? "Checking…" : checkDisabled ? "Preparing…" : "Check"}
                </button>
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
