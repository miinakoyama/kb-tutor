"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Edit2,
  Trash2,
  BarChart3,
} from "lucide-react";
import type { Question } from "@/types/question";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { LatexText } from "@/components/shared/LatexText";
import { GlossaryPanel } from "@/components/shared/GlossaryPanel";

interface QuestionPreviewCardProps {
  question: Question;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  /** Highlight when this question is in the Self Practice bank (with onToggleIncludeInSelfPractice). */
  includeInSelfPractice?: boolean;
  onToggleIncludeInSelfPractice?: () => void;
  isEditable?: boolean;
}

export function QuestionPreviewCard({
  question,
  index,
  onEdit,
  onDelete,
  includeInSelfPractice,
  onToggleIncludeInSelfPractice,
  isEditable = true,
}: QuestionPreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inlineTerms = question.inlineTerms ?? [];
  const sidebarTerms = question.sidebarTerms ?? [];
  const glossaryCount = inlineTerms.length + sidebarTerms.length;

  return (
    <div className="rounded-xl border border-slate-gray/20 bg-white shadow-sm overflow-hidden transition-colors">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-medium text-slate-gray/60 bg-slate-gray/10 px-2 py-0.5 rounded">
                Q{index + 1}
              </span>
              <span className="text-xs text-slate-gray/60">{question.topic}</span>
              {question.standardId && (
                <span className="text-xs text-slate-gray/60 bg-slate-gray/10 px-2 py-0.5 rounded">
                  {question.standardId}
                </span>
              )}
              {question.dok && (
                <span className="text-xs text-white bg-[#16a34a]/80 px-2 py-0.5 rounded">
                  DOK {question.dok}
                </span>
              )}
              {question.diagram && (
                <span className="text-xs text-[#16a34a] flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  {question.diagram.type}
                </span>
              )}
              {glossaryCount > 0 && (
                <span className="text-xs text-[#14532d] bg-[#16a34a]/10 px-2 py-0.5 rounded">
                  Glossary {glossaryCount}
                </span>
              )}
            </div>

            <p className="text-sm text-slate-gray line-clamp-2">
              <LatexText text={question.text} />
            </p>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-xs text-[#16a34a] hover:text-[#15803d] flex items-center gap-1"
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
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3 flex-shrink-0">
              {onToggleIncludeInSelfPractice && (
                <div className="flex items-center gap-2">
                  <span
                    id={`sp-label-${question.id}`}
                    className="text-xs font-medium text-slate-gray/70 whitespace-nowrap"
                  >
                    Self Practice
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby={`sp-label-${question.id}`}
                    aria-checked={includeInSelfPractice === true}
                    onClick={onToggleIncludeInSelfPractice}
                    className={`flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50 focus-visible:ring-offset-2 ${
                      includeInSelfPractice === true
                        ? "justify-end bg-[#16a34a]"
                        : "justify-start bg-slate-200"
                    }`}
                    title={
                      includeInSelfPractice === true
                        ? "Included in Self Practice question bank"
                        : "Not included in Self Practice"
                    }
                  >
                    <span className="pointer-events-none h-5 w-5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>
              )}
              <button
                onClick={onEdit}
                className="p-2 rounded-lg text-slate-gray/50 hover:text-[#16a34a] hover:bg-[#16a34a]/10 transition-colors"
                title="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-2 rounded-lg text-slate-gray/50 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-gray/10">
          {question.diagram && (
            <div className="mb-4 p-4 bg-slate-gray/5 rounded-lg">
              <DiagramRenderer diagram={question.diagram} />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-gray/60 uppercase tracking-wide">
              Options
            </p>
            {question.options.map((option, optionIndex) => {
              const isCorrect = option.id === question.correctOptionId;
              const label =
                /^[A-Z]$/.test(option.id)
                  ? option.id
                  : String.fromCharCode(65 + optionIndex);
              return (
                <div
                  key={option.id}
                  className={`p-3 rounded-lg text-sm ${
                    isCorrect
                      ? "bg-[#16a34a]/5 border border-[#16a34a]/20"
                      : "bg-slate-gray/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${
                        isCorrect
                          ? "bg-[#16a34a] text-white"
                          : "bg-slate-gray/20 text-slate-gray/70"
                      }`}
                    >
                      {label}
                    </span>
                    <div className="flex-1">
                      <p className={isCorrect ? "font-medium" : ""}>
                        <LatexText text={option.text} />
                      </p>
                      {option.feedback && (
                        <p className="text-xs text-slate-gray/60 mt-1">
                          <LatexText text={option.feedback} />
                        </p>
                      )}
                    </div>
                    {isCorrect && (
                      <CheckCircle2 className="w-4 h-4 text-[#16a34a] flex-shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {question.keyKnowledge && (
            <div className="mt-4 p-3 bg-[#16a34a]/5 rounded-lg border border-[#16a34a]/20">
              <p className="text-xs font-semibold text-[#16a34a] mb-1">Key Knowledge</p>
              <p className="text-sm text-slate-gray">
                <LatexText text={question.keyKnowledge} />
              </p>
            </div>
          )}

          {question.focusHint && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 mb-1">Focus Hint</p>
              <p className="text-sm text-blue-800">
                <LatexText text={question.focusHint} />
              </p>
            </div>
          )}

          {glossaryCount > 0 && (
            <div className="mt-4 space-y-2">
              {inlineTerms.length > 0 && (
                <GlossaryPanel
                  terms={inlineTerms}
                  title={`Inline Terms (${inlineTerms.length})`}
                />
              )}
              {sidebarTerms.length > 0 && (
                <GlossaryPanel
                  terms={sidebarTerms}
                  title={`Sidebar Terms (${sidebarTerms.length})`}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
