"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Lightbulb } from "lucide-react";
import type { Question, AnswerRecord } from "@/types/question";

const PRIMARY_COLOR = "#16a34a";
const PRIMARY_LIGHT = "rgba(22, 163, 74, 0.1)";

interface FeedbackPanelProps {
  question: Question;
  answer: AnswerRecord;
  showKeyKnowledge?: boolean;
  showMisconception?: boolean;
}

export function FeedbackPanel({
  question,
  answer,
  showKeyKnowledge = false,
  showMisconception = false,
}: FeedbackPanelProps) {
  const selectedOption = question.options.find(
    (opt) => opt.id === answer.selectedOptionId
  );
  const correctOption = question.options.find(
    (opt) => opt.id === question.correctOptionId
  );
  const isCorrect = answer.selectedOptionId === question.correctOptionId;
  
  const displayOption = selectedOption || correctOption;
  const displayIsCorrect = selectedOption ? isCorrect : true;

  const cleanFeedback = (feedback?: string) => {
    if (!feedback) return "";
    return feedback
      .replace(/^(Correct\.|Incorrect\.)\s*/i, "")
      .trim();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-5 space-y-3"
    >
      <div
        className="p-4 rounded-xl border"
        style={{
          backgroundColor: displayIsCorrect ? PRIMARY_LIGHT : "rgba(248, 113, 113, 0.1)",
          borderColor: displayIsCorrect ? `${PRIMARY_COLOR}40` : "rgba(248, 113, 113, 0.3)",
        }}
      >
        <div className="flex items-start gap-3">
          {displayIsCorrect ? (
            <CheckCircle2
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: PRIMARY_COLOR }}
            />
          ) : (
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold mb-1"
              style={{ color: displayIsCorrect ? "#166534" : "#991b1b" }}
            >
              {displayIsCorrect ? "Correct!" : "Incorrect"}
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: displayIsCorrect ? "#166534" : "#991b1b" }}
            >
              {cleanFeedback(displayOption?.feedback)}
            </p>
          </div>
        </div>
      </div>

      {showKeyKnowledge && question.keyKnowledge && (
        <div className="p-3 rounded-xl border border-[#16a34a]/20 bg-[#16a34a]/5">
          <div className="flex items-start gap-2.5">
            <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#16a34a]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a] mb-1">
                Key Idea
              </p>
              <p className="text-sm text-slate-gray leading-relaxed">
                {question.keyKnowledge}
              </p>
            </div>
          </div>
        </div>
      )}

      {showMisconception && question.commonMisconception && !displayIsCorrect && (
        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
            Common Misconception
          </p>
          <p className="text-sm text-amber-900 leading-relaxed">
            {question.commonMisconception}
          </p>
        </div>
      )}
    </motion.div>
  );
}
