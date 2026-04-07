"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  BarChart3,
} from "lucide-react";
import type { Question } from "@/types/question";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";

interface QuestionPreviewCardProps {
  question: Question;
  index: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisibility?: () => void;
  isEditable?: boolean;
}

export function QuestionPreviewCard({
  question,
  index,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onToggleVisibility,
  isEditable = true,
}: QuestionPreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isHidden = question.isVisible === false;

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-colors ${
        isSelected ? "border-[#16a34a]" : "border-slate-gray/20"
      } ${isHidden ? "opacity-60" : ""}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="mt-1 w-4 h-4 rounded border-slate-gray/30 text-[#16a34a] focus:ring-[#16a34a]/50"
          />

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
              {isHidden && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <EyeOff className="w-3 h-3" />
                  Hidden
                </span>
              )}
            </div>

            <p className="text-sm text-slate-gray line-clamp-2">
              {question.text}
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
            <div className="flex items-center gap-1">
              {onToggleVisibility && (
                <button
                  onClick={onToggleVisibility}
                  className={`p-2 rounded-lg transition-colors ${
                    isHidden
                      ? "text-amber-500 hover:text-[#16a34a] hover:bg-[#16a34a]/10"
                      : "text-slate-gray/50 hover:text-amber-500 hover:bg-amber-50"
                  }`}
                  title={isHidden ? "Show in tutor" : "Hide from tutor"}
                >
                  {isHidden ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
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
            {question.options.map((option) => {
              const isCorrect = option.id === question.correctOptionId;
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
                      {option.id}
                    </span>
                    <div className="flex-1">
                      <p className={isCorrect ? "font-medium" : ""}>
                        {option.text}
                      </p>
                      {option.feedback && (
                        <p className="text-xs text-slate-gray/60 mt-1">
                          {option.feedback}
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
              <p className="text-sm text-slate-gray">{question.keyKnowledge}</p>
            </div>
          )}

          {question.focusHint && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 mb-1">Focus Hint</p>
              <p className="text-sm text-blue-800">{question.focusHint}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
