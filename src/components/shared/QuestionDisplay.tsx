"use client";

import { ReactNode } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Question, AnswerRecord } from "@/types/question";
import { OptionButton } from "./OptionButton";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { buildChoicesReadText } from "@/lib/tts-utils";
import { ReadAloudButton } from "./ReadAloudButton";

interface QuestionDisplayProps {
  question: Question;
  questionNumber: number;
  questionMetaText?: string;
  headerAction?: ReactNode;
  currentAnswer?: AnswerRecord;
  selectedOptionId?: string | null;
  pendingSelection?: boolean;
  revealCorrectAnswer?: boolean;
  compactLayout?: boolean;
  onOptionClick: (optionId: string) => void;
  renderQuestionText?: (text: string) => ReactNode;
  feedbackSlot?: ReactNode;
  feedbackReadText?: string;
  belowOptionsSlot?: ReactNode;
  showOptionFeedbackIcons?: boolean;
}

export function QuestionDisplay({
  question,
  questionNumber,
  questionMetaText,
  headerAction,
  currentAnswer,
  selectedOptionId,
  pendingSelection = false,
  revealCorrectAnswer = true,
  compactLayout = false,
  onOptionClick,
  renderQuestionText,
  feedbackSlot,
  feedbackReadText,
  belowOptionsSlot,
  showOptionFeedbackIcons = false,
}: QuestionDisplayProps) {
  const isAnswered = currentAnswer !== undefined;
  const choicesReadText = buildChoicesReadText(question);
  const {
    isSupported,
    isSpeaking,
    currentSection,
    toggleSpeak,
  } = useTextToSpeech();
  const isQuestionReading = isSpeaking && currentSection === "question";
  const isChoicesReading = isSpeaking && currentSection === "choices";
  const isFeedbackReading = isSpeaking && currentSection === "feedback";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className={`rounded-xl border border-[#16a34a]/30 bg-white shadow-sm ${
          compactLayout ? "p-4 sm:p-5" : "p-4 sm:p-6"
        }`}
      >
        <div className={`flex items-start justify-between gap-3 ${compactLayout ? "mb-2" : "mb-3"}`}>
          <div className="flex items-center gap-3">
            <p className={`${compactLayout ? "text-base" : "text-sm"} font-bold text-slate-gray`}>
              Question {questionNumber}
            </p>
            {questionMetaText && (
              <p className="text-sm text-slate-gray/60">{questionMetaText}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isSupported && (
              <ReadAloudButton
                section="question"
                label="Question"
                text={question.text}
                isSpeaking={isSpeaking}
                currentSection={currentSection}
                onToggle={toggleSpeak}
              />
            )}
            {headerAction}
          </div>
        </div>

        <div
          className={`prose prose-sm max-w-none text-slate-gray ${compactLayout ? "mb-4" : "mb-5"} rounded-lg transition-colors ${
            isQuestionReading ? "bg-[#16a34a]/10 px-3 py-2" : ""
          }`}
        >
          {renderQuestionText ? (
            <div className={`whitespace-pre-wrap font-medium leading-relaxed ${compactLayout ? "text-[15px]" : "text-base"}`}>
              {renderQuestionText(question.text)}
            </div>
          ) : (
            <p className={`whitespace-pre-wrap font-medium leading-relaxed ${compactLayout ? "text-[15px]" : "text-base"}`}>
              {question.text}
            </p>
          )}
        </div>

        {question.imageUrl && (
          <div className={`rounded-lg overflow-hidden ${compactLayout ? "my-3" : "my-4"}`}>
            <Image
              src={question.imageUrl}
              alt="Question illustration"
              width={600}
              height={400}
              className={`w-full object-contain ${compactLayout ? "max-h-[220px]" : "max-h-[300px]"}`}
            />
          </div>
        )}

        {question.diagram && (
          <div
            className={`rounded-lg overflow-auto border border-slate-gray/10 ${
              compactLayout ? "my-3 max-h-[240px]" : "my-4 max-h-[320px]"
            }`}
          >
            <DiagramRenderer diagram={question.diagram} />
          </div>
        )}

        <div
          className={`rounded-lg transition-colors mb-3 ${
            isChoicesReading ? "bg-[#16a34a]/10 px-3 py-2" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
              Choices
            </p>
            {isSupported && (
              <ReadAloudButton
                section="choices"
                label="Choices"
                text={choicesReadText}
                isSpeaking={isSpeaking}
                currentSection={currentSection}
                onToggle={toggleSpeak}
              />
            )}
          </div>
          <div className={`${compactLayout ? "space-y-2 mt-1.5" : "space-y-2.5 mt-2"}`}>
            {question.options.map((opt) => {
              const isSelected = isAnswered
                ? currentAnswer?.selectedOptionId === opt.id
                : selectedOptionId === opt.id;
              const showCorrect =
                isAnswered && revealCorrectAnswer && opt.id === question.correctOptionId;
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
                  pendingSelection={pendingSelection}
                  compact={compactLayout}
                />
              );
            })}
          </div>
        </div>

        {isSupported && isAnswered && feedbackReadText && (
          <div
            className={`mt-4 mb-2 rounded-lg transition-colors ${
              isFeedbackReading ? "bg-[#16a34a]/10 px-3 py-2" : ""
            }`}
          >
            <ReadAloudButton
              section="feedback"
              label="Feedback"
              text={feedbackReadText}
              isSpeaking={isSpeaking}
              currentSection={currentSection}
              onToggle={toggleSpeak}
            />
          </div>
        )}

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
