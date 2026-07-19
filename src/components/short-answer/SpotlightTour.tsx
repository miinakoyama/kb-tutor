"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { markShortAnswerTourSeen } from "@/lib/short-answer/tour-settings";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

export interface TourLegendItem {
  /** Matches the real dot colors used elsewhere (PartCard attempt dots). */
  color: "correct" | "incorrect";
  label: string;
}

export interface TourStep {
  id: string;
  stepLabel: string;
  title: string;
  /** Lines rendered as separate paragraphs (bullets welcome). */
  lines: string[];
  /** Color-coded dot legend, rendered below the lines (e.g. attempt-dot meanings). */
  legend?: TourLegendItem[];
  /** Resolve the live DOM element to spotlight. */
  getTarget: () => HTMLElement | null;
  onEnter?: () => void;
  onLeave?: () => void;
}

// Mirror the real attempt dots (see PartCard) so this key stays accurate and
// the wrong swatch reads from the shared --saq-wrong variable rather than a
// separate red/rose literal.
const LEGEND_DOT_CLASS: Record<TourLegendItem["color"], string> = {
  correct: "bg-[var(--assignment-progress-fill)]/60",
  incorrect: "bg-[var(--saq-wrong)]/60",
};

interface SpotlightTourProps {
  steps: TourStep[];
  onClose: () => void;
}

interface TooltipPlacement {
  top: number;
  left: number;
}

const TOOLTIP_WIDTH = 300;
const TOOLTIP_EST_HEIGHT = 190;
const GAP = 14;
const MARGIN = 8;

function computePlacement(rect: DOMRect): TooltipPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const space = {
    top: rect.top,
    bottom: vh - rect.bottom,
    left: rect.left,
    right: vw - rect.right,
  };

  let top: number;
  let left: number;

  if (space.bottom >= TOOLTIP_EST_HEIGHT + GAP) {
    top = rect.bottom + GAP;
    left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  } else if (space.top >= TOOLTIP_EST_HEIGHT + GAP) {
    top = rect.top - TOOLTIP_EST_HEIGHT - GAP;
    left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  } else if (space.right >= TOOLTIP_WIDTH + GAP) {
    top = rect.top + rect.height / 2 - TOOLTIP_EST_HEIGHT / 2;
    left = rect.right + GAP;
  } else {
    top = rect.top + rect.height / 2 - TOOLTIP_EST_HEIGHT / 2;
    left = rect.left - TOOLTIP_WIDTH - GAP;
  }

  // Final clamp so the tooltip never leaves the viewport.
  left = Math.min(Math.max(left, MARGIN), vw - TOOLTIP_WIDTH - MARGIN);
  top = Math.min(Math.max(top, MARGIN), vh - TOOLTIP_EST_HEIGHT - MARGIN);
  return { top, left };
}

export function SpotlightTour({ steps, onClose }: SpotlightTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useDialogFocusTrap<HTMLDivElement>();

  const step = steps[stepIndex];

  const measure = useCallback(() => {
    const target = step?.getTarget() ?? null;
    if (!target) {
      setRect(null);
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    setRect(target.getBoundingClientRect());
  }, [step]);

  useLayoutEffect(() => {
    step?.onEnter?.();
    measure();
    return () => step?.onLeave?.();
  }, [step, measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [measure]);

  const finish = useCallback(() => {
    void markShortAnswerTourSeen();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") {
        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      }
      if (e.key === "ArrowLeft") {
        setStepIndex((i) => Math.max(i - 1, 0));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finish, steps.length]);

  if (!step) return null;

  const placement = rect ? computePlacement(rect) : { top: 100, left: MARGIN };
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="How to use short-answer questions">
      {/* Dark overlay with a spotlight cut-out around the target. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-[9999px] ring-black/55 transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 3px rgb(12 107 69 / 0.85)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      {/* Click-catcher so clicks outside the tooltip don't hit the page. */}
      <div className="absolute inset-0 select-none" onClick={finish} />

      <div
        ref={tooltipRef}
        tabIndex={-1}
        className="absolute flex select-none flex-col gap-2 rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg-strong)] p-4 backdrop-blur-md"
        style={{
          top: placement.top,
          left: placement.left,
          width: TOOLTIP_WIDTH,
          boxShadow: "var(--assignment-elevated-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
        aria-live="polite"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
          {stepIndex + 1} of {steps.length} · {step.stepLabel}
        </span>
        <h3 className="text-sm font-bold text-[color:var(--foreground)]">{step.title}</h3>
        <div className="flex flex-col gap-1">
          {step.lines.map((line, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed text-[color:var(--foreground)]/70">
              {line}
            </p>
          ))}
        </div>

        {step.legend && (
          <div className="flex items-center gap-4">
            {step.legend.map((entry) => (
              <span
                key={entry.label}
                className="flex items-center gap-1.5 text-[12.5px] text-[color:var(--foreground)]/70"
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT_CLASS[entry.color]}`}
                />
                {entry.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Tour steps">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === stepIndex}
                aria-label={`Go to step ${i + 1}`}
                onClick={() => setStepIndex(i)}
                className={`h-1.5 w-1.5 rounded-full transition ${
                  i === stepIndex
                    ? "bg-[color:var(--assignment-cta-bg-strong)]"
                    : "bg-[color:var(--foreground)]/25"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={finish}
              className="text-[12px] text-[color:var(--foreground)]/45 transition hover:text-[color:var(--foreground)]/70"
            >
              Skip
            </button>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className="rounded-full px-3 py-1 text-[12px] font-medium text-[color:var(--foreground)]/70 transition hover:bg-black/5"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
              className="rounded-full bg-[color:var(--assignment-cta-bg-strong)] px-3.5 py-1 text-[12px] font-semibold text-[color:var(--assignment-cta-text)] transition hover:bg-[color:var(--assignment-cta-bg-hover)]"
            >
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
