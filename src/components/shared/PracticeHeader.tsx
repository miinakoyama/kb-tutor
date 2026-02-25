"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import type { PracticeMode } from "@/types/question";

const MODE_LABELS: Record<PracticeMode, string> = {
  guided: "Guided Mode",
  practice: "Practice Mode",
  exam: "Mock Exam",
  review: "Review Mode",
};

interface PracticeHeaderProps {
  topicName?: string;
  mode: PracticeMode;
  modeLabel?: string;
  backHref: string;
  currentQuestion?: number;
  totalQuestions?: number;
  answeredCount?: number;
}

export function PracticeHeader({
  topicName,
  mode,
  modeLabel: customModeLabel,
  backHref,
  currentQuestion,
  totalQuestions,
  answeredCount,
}: PracticeHeaderProps) {
  const modeLabel = customModeLabel ?? MODE_LABELS[mode];
  const isBackToHome = backHref === "/";
  const backLabel = isBackToHome ? "Back to Home" : "Back to Mode Selection";
  const showProgress = currentQuestion !== undefined && totalQuestions !== undefined;
  const useAnsweredProgress = answeredCount !== undefined && totalQuestions !== undefined;
  const progressPercent = useAnsweredProgress
    ? Math.round((answeredCount / totalQuestions) * 100)
    : showProgress
      ? Math.round((currentQuestion / totalQuestions) * 100)
      : 0;

  return (
    <div className="flex-shrink-0 mb-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-4"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
          <ArrowLeft className="w-4 h-4 text-[#14532d]" />
        </span>
        {backLabel}
      </Link>

      <div className="mb-3">
        {topicName && (
          <h1 className="text-xl font-bold font-heading text-[#14532d] mb-1">
            {topicName}
          </h1>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#16a34a] font-medium">{modeLabel}</span>
          {showProgress && (
            <>
              <span className="text-slate-gray/40">·</span>
              <span className="text-slate-gray/60">
                {useAnsweredProgress
                  ? `${answeredCount} of ${totalQuestions} answered`
                  : `Question ${currentQuestion} of ${totalQuestions}`}
              </span>
            </>
          )}
        </div>
      </div>

      {showProgress && (
        <div className="h-2 bg-slate-gray/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[#16a34a]"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </div>
  );
}
