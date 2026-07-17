"use client";

import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bookmark } from "lucide-react";
import { getBackLabel } from "./PracticeHeader";

/**
 * Shared button recipes for the session shell, matching the design-system
 * CTA buttons (glass border + soft shadow pills from the assignments page).
 * The primary action (Next / Submit) is the only filled brand button on
 * screen; everything else uses the secondary row-CTA treatment.
 */
export const sessionPrimaryButtonClass =
  "inline-flex items-center justify-center gap-2 h-[52px] min-h-[44px] px-7 rounded-full font-bold text-[16px] transition duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

export const sessionPrimaryButtonStyle = {
  color: "var(--assignment-cta-text)",
  background: "var(--assignment-cta-bg-strong)",
  border: "1.5px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-cta-elevated-shadow)",
  letterSpacing: "0.3px",
  wordSpacing: "1px",
} as const;

export const sessionSecondaryButtonClass =
  "inline-flex items-center justify-center gap-2 h-[52px] min-h-[44px] px-6 rounded-full font-bold text-[15px] bg-[var(--assignment-row-cta-bg)] transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export const sessionSecondaryButtonStyle = {
  color: "var(--assignment-row-cta-text)",
  border: "1.5px solid var(--assignment-row-cta-border)",
  boxShadow: "var(--assignment-row-cta-shadow)",
  letterSpacing: "0.3px",
  wordSpacing: "1px",
} as const;

/** Header-sized variant of the secondary recipe (Back / Finish Session). */
const headerButtonClass =
  "inline-flex items-center justify-center gap-2 h-12 min-h-[44px] px-5 rounded-full font-semibold text-[14px] bg-[var(--assignment-row-cta-bg)] transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 whitespace-nowrap";

const MAX_PROGRESS_SEGMENTS = 16;

function CompactProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  if (total <= 0) return null;
  if (total <= MAX_PROGRESS_SEGMENTS) {
    return (
      <div
        className="flex items-center gap-1 w-48 sm:w-72 lg:w-96"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Question ${current} of ${total}`}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className="h-2 flex-1 rounded-full"
            style={{
              background:
                i < current
                  ? "var(--assignment-progress-fill)"
                  : "var(--border-default)",
            }}
          />
        ))}
      </div>
    );
  }
  const percent = Math.round((current / total) * 100);
  return (
    <div
      className="h-2 w-48 sm:w-72 lg:w-96 rounded-full overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={`Question ${current} of ${total}`}
      style={{ background: "var(--border-default)" }}
    >
      <motion.span
        className="block h-full rounded-full"
        style={{ background: "var(--assignment-progress-fill)" }}
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

interface QuestionSessionShellProps {
  backHref: string;
  showBackLink?: boolean;
  currentQuestion: number;
  totalQuestions: number;
  /** Small muted line under the question counter (mode label, topic, ...). */
  contextLabel?: string;
  /** Hide the segmented progress bar under the question counter (exam mode). */
  hideProgress?: boolean;
  /**
   * Hide the "Question X of Y" counter and progress bar entirely (open-ended
   * self-practice sessions, which have no fixed total the student is working
   * toward — they end only when the student chooses to finish).
   */
  hideQuestionCounter?: boolean;
  /** When set, renders the secondary "Finish Session" header action. */
  onFinishSession?: () => void;
  /**
   * Right side of the header. When provided, replaces the default Finish
   * Session button (exam mode uses it for the timer + submit-exam action).
   */
  headerRight?: ReactNode;
  /**
   * Middle slot of the bottom action bar. When provided, replaces the default
   * bookmark button (exam mode uses it for bookmark + mark-for-review).
   */
  footerCenter?: ReactNode;
  /**
   * Workspace variant: "mcq" keeps a single vertical reading column
   * (max 1120px, or 1280px when mediaHeavy), "split" widens the workspace
   * for the two-column short-answer layout (max 1440px).
   */
  variant: "mcq" | "split";
  /** Widens the MCQ workspace for questions with images/diagrams. */
  mediaHeavy?: boolean;
  /** Ref to the scrollable workspace region (for scroll-to-top/bottom). */
  scrollRef?: Ref<HTMLDivElement>;
  onPrevious: () => void;
  previousDisabled?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  /** Right side of the bottom bar — the single primary Next/Submit action. */
  primaryAction: ReactNode;
  children: ReactNode;
}

/**
 * Stable three-region frame for question sessions: session header, scrollable
 * question workspace, and a persistent bottom action bar. Owns layout and
 * spacing only — all question state, submission, and feedback logic stays in
 * the caller.
 */
export function QuestionSessionShell({
  backHref,
  showBackLink = true,
  currentQuestion,
  totalQuestions,
  contextLabel,
  hideProgress = false,
  hideQuestionCounter = false,
  onFinishSession,
  headerRight,
  footerCenter,
  variant,
  mediaHeavy = false,
  scrollRef,
  onPrevious,
  previousDisabled = false,
  isBookmarked = false,
  onToggleBookmark,
  primaryAction,
  children,
}: QuestionSessionShellProps) {
  const workspaceWidthClass =
    variant === "split"
      ? "w-[calc(100%-32px)] sm:w-[calc(100%-64px)] lg:w-[calc(100%-80px)] max-w-[1440px]"
      : `w-[calc(100%-32px)] sm:w-[calc(100%-64px)] lg:w-[calc(100%-96px)] ${
          mediaHeavy ? "max-w-[1280px]" : "max-w-[1120px]"
        }`;

  return (
    <div className="flex h-full flex-col">
      {/* Session header */}
      <header
        className="flex-shrink-0 h-[114px] short:h-[72px] xshort:h-[60px] grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:px-8 border-b bg-surface"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center justify-start min-w-0">
          {showBackLink && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 h-12 min-h-[44px] px-2 -ml-2 rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span
                className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0"
                style={{ background: "var(--assignment-calendar-nav-bg)" }}
              >
                <ArrowLeft className="w-4 h-4" />
              </span>
              <span className="hidden sm:inline truncate">
                {getBackLabel(backHref)}
              </span>
            </Link>
          )}
        </div>

        <div className="flex flex-col items-center justify-center gap-1.5 min-w-0">
          {!hideQuestionCounter && (
            <p className="font-heading font-semibold text-slate-gray text-[15px] leading-none whitespace-nowrap">
              Question {currentQuestion} of {totalQuestions}
              {contextLabel ? (
                <span className="ml-2 hidden md:inline text-[13px] font-normal text-muted-foreground">
                  {contextLabel}
                </span>
              ) : null}
            </p>
          )}
          {!hideProgress && !hideQuestionCounter && (
            <CompactProgress current={currentQuestion} total={totalQuestions} />
          )}
        </div>

        <div className="flex items-center justify-end gap-3 min-w-0">
          {headerRight ??
            (onFinishSession ? (
              <button
                type="button"
                onClick={onFinishSession}
                className={headerButtonClass}
                style={sessionSecondaryButtonStyle}
              >
                Finish Session
              </button>
            ) : null)}
        </div>
      </header>

      {/* Question workspace */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className={`mx-auto py-[clamp(0.75rem,2.5vh,2rem)] ${workspaceWidthClass}`}>
          {children}
        </div>
      </div>

      {/* Persistent bottom action bar */}
      <footer
        className="flex-shrink-0 h-[84px] short:h-[68px] xshort:h-[60px] flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 border-t bg-surface"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <button
          type="button"
          onClick={onPrevious}
          disabled={previousDisabled}
          className={sessionSecondaryButtonClass}
          style={sessionSecondaryButtonStyle}
        >
          <ArrowLeft className="w-4 h-4" />
          Previous
        </button>

        {footerCenter ? (
          <div className="flex items-center gap-3">{footerCenter}</div>
        ) : onToggleBookmark ? (
          <button
            type="button"
            onClick={onToggleBookmark}
            aria-pressed={isBookmarked}
            className={sessionSecondaryButtonClass}
            style={sessionSecondaryButtonStyle}
          >
            <Bookmark
              className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`}
            />
            <span className="hidden sm:inline">
              {isBookmarked ? "Bookmarked" : "Bookmark"}
            </span>
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center justify-end">{primaryAction}</div>
      </footer>
    </div>
  );
}
