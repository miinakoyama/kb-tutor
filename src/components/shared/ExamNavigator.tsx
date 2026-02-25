"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import type { AnswerRecord } from "@/types/question";

type FilterTab = "all" | "unanswered" | "flagged";

interface ExamNavigatorProps {
  totalQuestions: number;
  currentIndex: number;
  answers: Record<number, AnswerRecord>;
  onNavigate: (index: number) => void;
}

export function ExamNavigator({
  totalQuestions,
  currentIndex,
  answers,
  onNavigate,
}: ExamNavigatorProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const isAnswered = (i: number) => !!answers[i]?.selectedOptionId;
  const answeredCount = Array.from({ length: totalQuestions }, (_, i) => i).filter(isAnswered).length;
  const unansweredCount = totalQuestions - answeredCount;
  const flaggedCount = Object.values(answers).filter((a) => a.flagged).length;

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "All", count: totalQuestions },
    { id: "unanswered", label: "Unanswered", count: unansweredCount },
    { id: "flagged", label: "Flagged", count: flaggedCount },
  ];

  const allIndices = Array.from({ length: totalQuestions }, (_, i) => i);
  const filteredIndices = allIndices.filter((i) => {
    if (activeTab === "unanswered") return !isAnswered(i);
    if (activeTab === "flagged") return answers[i]?.flagged;
    return true;
  });

  return (
    <div className="rounded-2xl border border-[#16a34a]/30 bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold text-slate-gray mb-1">Questions</h3>
        <p className="text-sm text-slate-gray/60">
          {answeredCount} answered · {unansweredCount} unanswered
        </p>
      </div>

      <div className="flex border-b border-slate-gray/10 px-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors rounded-t-lg ${
              activeTab === tab.id
                ? "text-[#16a34a] border-b-2 border-[#16a34a]"
                : "text-slate-gray/50 hover:text-slate-gray/70"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div className="p-4 max-h-80 overflow-y-auto">
        <div className="grid grid-cols-8 gap-2" role="navigation" aria-label="Question navigation">
          {filteredIndices.map((i) => {
            const answer = answers[i];
            const isCurrent = i === currentIndex;
            const answered = !!answer?.selectedOptionId;
            const isFlagged = answer?.flagged;

            const ariaLabel = `Question ${i + 1}, ${answered ? "answered" : "not answered"}${isFlagged ? ", flagged" : ""}${isCurrent ? ", current" : ""}`;

            return (
              <button
                key={i}
                onClick={() => onNavigate(i)}
                aria-label={ariaLabel}
                aria-current={isCurrent ? "true" : undefined}
                className={`relative w-full aspect-square rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50 ${
                  isCurrent
                    ? "ring-2 ring-[#16a34a] ring-offset-1"
                    : ""
                }`}
                style={{
                  backgroundColor: answered ? "rgba(22, 163, 74, 0.15)" : "#f1f5f9",
                  color: answered ? "#16a34a" : "#64748b",
                }}
              >
                {i + 1}
                {isFlagged && (
                  <Flag className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
