"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import type { PracticeMode } from "@/types/question";

const MODE_LABELS: Record<PracticeMode, string> = {
  practice: "Practice Mode",
  exam: "Mock Exam",
  review: "Review Mode",
};

const MODE_LABEL_COLORS: Record<PracticeMode, string> = {
  practice: "var(--assignment-mode-practice)",
  exam: "var(--assignment-mode-exam)",
  review: "var(--assignment-mode-review)",
};

const BACK_LABELS: Record<string, string> = {
  "/": "Back to Home",
  "/self-practice": "Back to Self Practice",
  "/assignments": "Back to My Assignment",
  "/bookmarks": "Back to Review",
};

export function getBackLabel(backHref: string): string {
  return BACK_LABELS[backHref] ?? "Back";
}

interface PracticeHeaderProps {
  topicName?: string;
  mode: PracticeMode;
  modeLabel?: string;
  backHref: string;
  showBackLink?: boolean;
  inlineProgress?: boolean;
  compactSpacing?: boolean;
  currentQuestion?: number;
  totalQuestions?: number;
  answeredCount?: number;
  /**
   * Optional slot rendered on the right side of the topic/progress block.
   * Used by exam mode to inline the timer and submit button so they share
   * vertical space with the progress indicator.
   */
  rightSlot?: ReactNode;
}

export function PracticeHeader({
  topicName,
  mode,
  modeLabel: customModeLabel,
  backHref,
  showBackLink = true,
  inlineProgress = false,
  compactSpacing = false,
  currentQuestion,
  totalQuestions,
  answeredCount,
  rightSlot,
}: PracticeHeaderProps) {
  const modeLabel = customModeLabel ?? MODE_LABELS[mode];
  const hasModeLabelText = modeLabel.trim().length > 0;
  const showModeLabel = mode !== "practice" && hasModeLabelText;
  const showTopicName = Boolean(topicName) && topicName !== "Self Practice";
  const backLabel = getBackLabel(backHref);
  const showProgress = currentQuestion !== undefined && totalQuestions !== undefined;
  const useAnsweredProgress = answeredCount !== undefined && totalQuestions !== undefined;
  const showAnsweredOnly = answeredCount !== undefined && totalQuestions === undefined && currentQuestion === undefined;
  const progressPercent = useAnsweredProgress
    ? Math.round((answeredCount / totalQuestions) * 100)
    : showProgress
      ? Math.round((currentQuestion / totalQuestions) * 100)
      : 0;

  return (
    <div className={`flex-shrink-0 ${compactSpacing ? "mb-3" : "mb-6"}`}>
      {showBackLink && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: "var(--assignment-calendar-nav-bg)" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </span>
          {backLabel}
        </Link>
      )}

      <div className={compactSpacing ? "mb-2" : "mb-3"}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {showTopicName && (
              <h1
                className="font-semibold font-heading text-slate-gray mb-1"
                style={{ fontSize: 19, lineHeight: 1.2 }}
              >
                {topicName}
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {showModeLabel && (
                <span className="font-medium" style={{ color: MODE_LABEL_COLORS[mode] }}>
                  {modeLabel}
                </span>
              )}
              {showProgress && (
                <>
                  {showModeLabel && <span className="text-muted-foreground">·</span>}
                  <span className="text-muted-foreground">
                    {useAnsweredProgress
                      ? `${answeredCount} of ${totalQuestions} answered`
                      : `Question ${currentQuestion} of ${totalQuestions}`}
                  </span>
                  {inlineProgress && (
                    <span className="ml-1 inline-flex items-center min-w-0 w-24 sm:w-36">
                      <span
                        className="h-1.5 w-full rounded-full overflow-hidden border"
                        style={{
                          background: "var(--surface-muted)",
                          borderColor: "var(--border-default)",
                        }}
                      >
                        <motion.span
                          className="block h-full rounded-full"
                          style={{ background: "var(--assignment-progress-fill)" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPercent}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </span>
                    </span>
                  )}
                </>
              )}
              {showAnsweredOnly && answeredCount !== undefined && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{answeredCount} answered</span>
                </>
              )}
            </div>
          </div>
          {rightSlot && (
            <div className="flex-shrink-0 flex items-center gap-3">
              {rightSlot}
            </div>
          )}
        </div>
      </div>

      {showProgress && !inlineProgress && (
        <div
          className="h-2 rounded-full overflow-hidden border"
          style={{ background: "var(--surface-muted)", borderColor: "var(--border-default)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: "var(--assignment-progress-fill)" }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </div>
  );
}
