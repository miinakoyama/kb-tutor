"use client";

import { useState } from "react";
import { Flag, Check } from "lucide-react";
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
    <div className="rounded-2xl border border-border-default bg-surface shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold text-foreground mb-1">Questions</h3>
        <p className="text-sm text-muted-foreground">
          {answeredCount} answered · {unansweredCount} unanswered
        </p>
      </div>

      <div className="flex border-b border-border-subtle px-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors rounded-t-lg ${
              activeTab === tab.id
                ? "text-forest border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div className="p-4 max-h-[60vh] sm:max-h-80 overflow-y-auto overflow-x-hidden">
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2" role="navigation" aria-label="Question navigation">
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
                className={`relative w-full aspect-square min-h-[44px] rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex items-center justify-center ${
                  answered
                    ? "bg-primary-light text-foreground"
                    : "bg-surface-muted text-muted-foreground hover:bg-foreground/5"
                } ${
                  isCurrent
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                    : "border border-border-subtle"
                }`}
              >
                {i + 1}
                {answered && (
                  <Check className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-white bg-primary rounded-full p-0.5" strokeWidth={3} />
                )}
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
