"use client";

import { ReactNode } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Question, AnswerRecord } from "@/types/question";
import { OptionButton } from "./OptionButton";

interface QuestionDisplayProps {
  question: Question;
  questionNumber: number;
  currentAnswer?: AnswerRecord;
  onOptionClick: (optionId: string) => void;
  renderQuestionText?: (text: string) => ReactNode;
  feedbackSlot?: ReactNode;
  belowOptionsSlot?: ReactNode;
  showOptionFeedbackIcons?: boolean;
}

export function QuestionDisplay({
  question,
  questionNumber,
  currentAnswer,
  onOptionClick,
  renderQuestionText,
  feedbackSlot,
  belowOptionsSlot,
  showOptionFeedbackIcons = false,
}: QuestionDisplayProps) {
  const isAnswered = currentAnswer !== undefined;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-[#16a34a]/30 bg-white p-4 sm:p-6 shadow-sm"
      >
        <p className="text-sm text-slate-gray/60 mb-3">
          Question {questionNumber}
        </p>

        <div className="prose prose-sm max-w-none text-slate-gray mb-5">
          {renderQuestionText ? (
            <div className="whitespace-pre-wrap text-base font-medium leading-relaxed">
              {renderQuestionText(question.text)}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-base font-medium leading-relaxed">
              {question.text}
            </p>
          )}
        </div>

        {question.imageUrl && (
          <div className="my-4 rounded-lg overflow-hidden">
            <Image
              src={question.imageUrl}
              alt="Question illustration"
              width={600}
              height={400}
              className="object-contain"
            />
          </div>
        )}

        <div className="space-y-2.5">
          {question.options.map((opt) => {
            const isSelected = currentAnswer?.selectedOptionId === opt.id;
            const showCorrect =
              isAnswered && opt.id === question.correctOptionId;
            const showWrong =
              isAnswered && isSelected && opt.id !== question.correctOptionId;

            return (
              <OptionButton
                key={opt.id}
                option={opt}
                isSelected={isSelected}
                showCorrect={showCorrect}
                showWrong={showWrong}
                isAnswered={isAnswered}
                onSelect={onOptionClick}
                showFeedbackIcon={showOptionFeedbackIcons}
              />
            );
          })}
        </div>

        {feedbackSlot}

        {belowOptionsSlot}

        {!isAnswered && !belowOptionsSlot && (
          <p className="mt-5 text-center text-sm text-slate-gray/50 italic">
            Select an answer to see feedback
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
