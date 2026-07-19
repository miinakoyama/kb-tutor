"use client";

import { Coffee } from "lucide-react";
import {
  sessionPrimaryButtonClass,
  sessionPrimaryButtonStyle,
  sessionSecondaryButtonClass,
  sessionSecondaryButtonStyle,
} from "@/components/shared/QuestionSessionShell";

interface PracticePaceCheckInProps {
  open: boolean;
  questionsCompleted: number;
  onContinue: () => void;
  onFinish: () => void;
}

/**
 * Mid-session pause for open-ended Self Practice. Offered once the weighted
 * pace threshold is reached so students can continue or finish intentionally.
 */
export function PracticePaceCheckIn({
  open,
  questionsCompleted,
  onContinue,
  onFinish,
}: PracticePaceCheckInProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="practice-pace-check-in-title"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-6 sm:p-8 shadow-[var(--assignment-card-shadow)]"
      >
        <div className="flex justify-center mb-4">
          <span
            className="inline-flex items-center justify-center w-14 h-14 rounded-full"
            style={{
              background: "var(--mastery-mastered-bg)",
              color: "var(--mastery-mastered)",
            }}
          >
            <Coffee className="w-7 h-7" aria-hidden />
          </span>
        </div>
        <h2
          id="practice-pace-check-in-title"
          className="text-xl sm:text-2xl font-bold text-center text-slate-gray font-heading mb-3"
          style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
        >
          Nice progress — take a breather?
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground text-center leading-relaxed mb-6">
          You&apos;ve worked through {questionsCompleted}{" "}
          {questionsCompleted === 1 ? "question" : "questions"} in this session.
          Keep going, or finish here and review what you&apos;ve done.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-center">
          <button
            type="button"
            onClick={onContinue}
            className={`${sessionPrimaryButtonClass} w-full sm:w-auto`}
            style={sessionPrimaryButtonStyle}
          >
            Continue practicing
          </button>
          <button
            type="button"
            onClick={onFinish}
            className={`${sessionSecondaryButtonClass} w-full sm:w-auto`}
            style={sessionSecondaryButtonStyle}
          >
            Finish session
          </button>
        </div>
      </div>
    </div>
  );
}
