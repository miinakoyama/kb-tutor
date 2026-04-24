"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { AdaptivePracticeMode } from "@/components/modes/AdaptivePracticeMode";
import { ExamMode } from "@/components/modes/ExamMode";
import type { PracticeMode, Question } from "@/types/question";

const MODE_OPTIONS: Array<{ mode: PracticeMode; label: string }> = [
  { mode: "practice", label: "Practice" },
  { mode: "review", label: "Review" },
  { mode: "exam", label: "Exam" },
];

interface QuestionSetPreviewClientProps {
  setId: string;
  setName: string;
  questions: Question[];
  mode: PracticeMode;
}

export function QuestionSetPreviewClient({
  setId,
  setName,
  questions,
  mode,
}: QuestionSetPreviewClientProps) {
  const modeLinks = useMemo(
    () =>
      MODE_OPTIONS.map((option) => ({
        ...option,
        href: `/preview/${encodeURIComponent(setId)}?mode=${option.mode}`,
      })),
    [setId],
  );

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="rounded-xl border border-[#16a34a]/30 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-[#166534] uppercase">
              Preview
            </p>
            <h1 className="text-base sm:text-lg font-semibold text-slate-gray truncate">
              {setName}
            </h1>
          </div>
          <Link
            href="/content/questions"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-gray/20 text-sm font-medium text-slate-gray hover:bg-slate-gray/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Question Sets
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {modeLinks.map((option) => {
            const isActive = option.mode === mode;
            return (
              <Link
                key={option.mode}
                href={option.href}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#16a34a] text-white"
                    : "bg-[#16a34a]/10 text-[#166534] hover:bg-[#16a34a]/20"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {mode === "exam" ? (
          <ExamMode
            questions={questions}
            topicName={setName}
            requestedQuestionCount={questions.length}
            isPreview
          />
        ) : (
          <AdaptivePracticeMode
            questions={questions}
            topicName={setName}
            questionCount={questions.length}
            mode={mode}
            backHref="/content/questions"
            showBackLink
            isPreview
          />
        )}
      </div>
    </div>
  );
}
