"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2, PenLine, Edit2 } from "lucide-react";
import type { Question } from "@/types/question";
import type { ShortAnswerItem } from "@/types/short-answer";
import { StimulusPanel } from "@/components/short-answer/StimulusPanel";
import { formatPartRubric } from "@/lib/short-answer/grading/common";

interface ShortAnswerPreviewCardProps {
  question: Question;
  item: ShortAnswerItem;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  includeInSelfPractice?: boolean;
  onToggleIncludeInSelfPractice?: () => void;
  isEditable?: boolean;
}

export function ShortAnswerPreviewCard({
  question,
  item,
  index,
  onEdit,
  onDelete,
  includeInSelfPractice,
  onToggleIncludeInSelfPractice,
  isEditable = true,
}: ShortAnswerPreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border-default bg-surface shadow-sm overflow-hidden transition-colors">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground bg-slate-gray/10 px-2 py-0.5 rounded">
                Q{index + 1}
              </span>
              <span className="text-xs text-white bg-primary/80 px-2 py-0.5 rounded flex items-center gap-1">
                <PenLine className="w-3 h-3" />
                Short Answer
              </span>
              <span className="text-xs text-muted-foreground">{question.topic}</span>
              {question.standardId && (
                <span className="text-xs text-muted-foreground bg-slate-gray/10 px-2 py-0.5 rounded">
                  {question.standardId}
                </span>
              )}
              <span className="text-xs text-heading bg-primary/10 px-2 py-0.5 rounded">
                {item.stimulus.type}
              </span>
              <span className="text-xs text-muted-foreground bg-slate-gray/10 px-2 py-0.5 rounded">
                {item.parts.length} parts
              </span>
            </div>

            <p className="text-sm text-slate-gray line-clamp-2">{item.stem}</p>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-xs text-primary hover:text-primary-hover flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show details
                </>
              )}
            </button>
          </div>

          {isEditable && (
            <div className="flex flex-shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
              {onToggleIncludeInSelfPractice && (
                <div className="flex items-center gap-2">
                  <span
                    id={`sp-label-${question.id}`}
                    className="text-xs font-medium text-muted-foreground whitespace-nowrap"
                  >
                    Self Practice
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby={`sp-label-${question.id}`}
                    aria-checked={includeInSelfPractice === true}
                    onClick={onToggleIncludeInSelfPractice}
                    className={`flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ${
                      includeInSelfPractice === true
                        ? "justify-end bg-primary"
                        : "justify-start bg-surface-muted"
                    }`}
                    title={
                      includeInSelfPractice === true
                        ? "Included in Self Practice question bank"
                        : "Not included in Self Practice"
                    }
                  >
                    <span className="pointer-events-none h-5 w-5 rounded-full bg-surface shadow-sm" />
                  </button>
                </div>
              )}
              <button
                onClick={onEdit}
                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-error-light transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border-subtle space-y-4">
          <StimulusPanel stem={item.stem} stimulus={item.stimulus} showHighlightHint={false} />

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Parts
            </p>
            {item.parts.map((part) => (
              <div
                key={part.label}
                className="rounded-lg border border-border-default bg-slate-gray/5 p-3"
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold flex items-center justify-center">
                    {part.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{part.taskType}</span>
                  <span className="text-xs text-muted-foreground">
                    {part.maxScore} pt{part.maxScore === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-sm text-slate-gray">{part.prompt}</p>
                <p className="mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Part Rubric
                </p>
                <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">
                  {formatPartRubric(part)}
                </p>
              </div>
            ))}
          </div>

          {item.annotatedResponses.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Annotated Responses
              </p>
              <div className="space-y-2">
                {[...item.annotatedResponses]
                  .sort((a, b) => b.score - a.score)
                  .map((response, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border-default p-3 text-sm"
                    >
                      <p className="font-medium text-slate-gray mb-1">
                        Score {response.score}
                      </p>
                      <p className="text-muted-foreground whitespace-pre-line">
                        {response.response}
                      </p>
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        {response.annotation}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {item.keyTerms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Key Terms
              </p>
              <ul className="space-y-1 text-sm">
                {item.keyTerms.map((term) => (
                  <li key={term.term}>
                    <span className="font-medium text-slate-gray">{term.term}</span>
                    <span className="text-muted-foreground"> — {term.definition}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Generated with {item.generation.modelId} · temperature{" "}
            {item.generation.temperature} · {item.generation.method}
          </div>
        </div>
      )}
    </div>
  );
}
