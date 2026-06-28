"use client";

import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, XCircle, Lightbulb } from "lucide-react";
import type { Question, AnswerRecord } from "@/types/question";

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
        className={`p-4 rounded-xl border ${
          displayIsCorrect
            ? "border-primary/40 bg-primary-light"
            : "border-error-border bg-error-light"
        }`}
      >
        <div className="flex items-start gap-3">
          {displayIsCorrect ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary" />
          ) : (
            <XCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-semibold mb-1 ${
                displayIsCorrect ? "text-forest" : "text-error"
              }`}
            >
              {displayIsCorrect ? "Correct!" : "Incorrect"}
            </p>
            <p className="text-sm text-slate-gray leading-relaxed">
              {cleanFeedback(displayOption?.feedback)}
            </p>
          </div>
        </div>
      </div>

      {showKeyKnowledge && question.keyKnowledge && (
        <div className="p-3 rounded-xl border border-primary/20 bg-surface-muted">
          <div className="flex items-start gap-2.5">
            <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
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
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-1">
                Common Misconception
              </p>
              <p className="text-sm text-slate-gray leading-relaxed">
                {question.commonMisconception}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
