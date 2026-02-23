"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, ChevronDown, Lightbulb } from "lucide-react";
import type { Question, AnswerRecord } from "@/types/question";

const PRIMARY_COLOR = "#16a34a";
const PRIMARY_LIGHT = "rgba(22, 163, 74, 0.1)";

interface FeedbackPanelProps {
  question: Question;
  answer: AnswerRecord;
  showKeyKnowledge?: boolean;
  showMisconception?: boolean;
  showAllOptionsFeedback?: boolean;
}

export function FeedbackPanel({
  question,
  answer,
  showKeyKnowledge = false,
  showMisconception = false,
  showAllOptionsFeedback = false,
}: FeedbackPanelProps) {
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const selectedOption = question.options.find(
    (opt) => opt.id === answer.selectedOptionId
  );
  const isCorrect = answer.isCorrect;

  const otherOptions = question.options.filter(
    (opt) => opt.id !== answer.selectedOptionId && opt.id !== question.correctOptionId
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-5 space-y-3"
    >
      <div
        className="p-4 rounded-xl border"
        style={{
          backgroundColor: isCorrect ? PRIMARY_LIGHT : "rgba(248, 113, 113, 0.1)",
          borderColor: isCorrect ? `${PRIMARY_COLOR}40` : "rgba(248, 113, 113, 0.3)",
        }}
      >
        <div className="flex items-start gap-3">
          {isCorrect ? (
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
              style={{ color: isCorrect ? "#166534" : "#991b1b" }}
            >
              {isCorrect ? "Correct!" : "Incorrect"}
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: isCorrect ? "#166534" : "#991b1b" }}
            >
              {selectedOption?.feedback}
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

      {showMisconception && question.commonMisconception && !isCorrect && (
        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
            Common Misconception
          </p>
          <p className="text-sm text-amber-900 leading-relaxed">
            {question.commonMisconception}
          </p>
        </div>
      )}

      {showAllOptionsFeedback && otherOptions.length > 0 && (
        <div>
          <button
            onClick={() => setShowOtherOptions(!showOtherOptions)}
            className="flex items-center gap-1.5 text-sm text-slate-gray/70 hover:text-slate-gray transition-colors"
          >
            <motion.span
              animate={{ rotate: showOtherOptions ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-4 h-4" />
            </motion.span>
            Why other options are wrong
          </button>
          {showOtherOptions && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2 space-y-2 overflow-hidden"
            >
              {otherOptions.map((opt) => (
                <div
                  key={opt.id}
                  className="p-3 rounded-lg border border-slate-gray/10 bg-slate-gray/5"
                >
                  <p className="text-xs font-medium text-slate-gray/60 mb-1">
                    Option {opt.id}: {opt.text}
                  </p>
                  <p className="text-sm text-slate-gray/80 leading-relaxed">
                    {opt.feedback}
                  </p>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}
