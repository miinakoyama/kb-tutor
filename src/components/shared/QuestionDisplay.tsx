"use client";

import { ReactNode } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Question, AnswerRecord } from "@/types/question";
import { OptionButton } from "./OptionButton";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { AdaptiveDiagramViewport } from "@/components/diagrams/AdaptiveDiagramViewport";
import { useTextToSpeech, type ReadSection } from "@/hooks/useTextToSpeech";
import { buildChoicesReadText } from "@/lib/tts-utils";
import { ReadAloudButton } from "./ReadAloudButton";

interface QuestionDisplayProps {
  question: Question;
  questionNumber: number;
  questionMetaText?: string;
  showHeader?: boolean;
  headerAction?: ReactNode;
  currentAnswer?: AnswerRecord;
  selectedOptionId?: string | null;
  pendingSelection?: boolean;
  revealCorrectAnswer?: boolean;
  compactLayout?: boolean;
  onOptionClick: (optionId: string) => void;
  renderQuestionText?: (text: string) => ReactNode;
  feedbackSlot?: ReactNode;
  belowOptionsSlot?: ReactNode;
  showOptionFeedbackIcons?: boolean;
  onReadAloud?: (section: ReadSection) => void;
  questionReadAloudTourId?: string;
  choicesReadAloudTourId?: string;
}

export function QuestionDisplay({
  question,
  questionNumber,
  questionMetaText,
  showHeader = true,
  headerAction,
  currentAnswer,
  selectedOptionId,
  pendingSelection = false,
  revealCorrectAnswer = true,
  compactLayout = false,
  onOptionClick,
  renderQuestionText,
  feedbackSlot,
  belowOptionsSlot,
  showOptionFeedbackIcons = false,
  onReadAloud,
  questionReadAloudTourId,
  choicesReadAloudTourId,
}: QuestionDisplayProps) {
  const isAnswered = currentAnswer !== undefined;
  const choicesReadText = buildChoicesReadText(question);
  const questionAndChoicesReadText = `${question.text} ${choicesReadText}`.trim();
  const {
    isSupported,
    isSpeaking,
    currentSection,
    toggleSpeak,
  } = useTextToSpeech();
  const isQuestionAndChoicesReading = isSpeaking && currentSection === "question";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className={`rounded-xl border border-primary/30 bg-surface shadow-sm ${
          compactLayout ? "p-4 sm:p-5" : "p-4 sm:p-6"
        }`}
      >
        {showHeader && (
          <div className={`flex items-start justify-between gap-3 ${compactLayout ? "mb-2" : "mb-3"}`}>
            <div className="flex items-center gap-3">
              <p className={`${compactLayout ? "text-base" : "text-sm"} font-bold text-slate-gray`}>
                Question {questionNumber}
              </p>
              {questionMetaText && (
                <p className="text-sm text-muted-foreground">{questionMetaText}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isSupported && (
                <div
                  className="relative"
                  data-tour-id={questionReadAloudTourId ?? choicesReadAloudTourId}
                >
                  <ReadAloudButton
                    section="question"
                    label="Question and choices"
                    text={questionAndChoicesReadText}
                    isSpeaking={isSpeaking}
                    currentSection={currentSection}
                    onToggle={toggleSpeak}
                    onPlay={onReadAloud}
                    iconOnly
                  />
                </div>
              )}
              {headerAction}
            </div>
          </div>
        )}

        <div
          className={`prose prose-sm max-w-none text-slate-gray ${compactLayout ? "mb-4" : "mb-5"} rounded-lg transition-colors ${
            isQuestionAndChoicesReading ? "bg-primary/10 px-3 py-2" : ""
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
          <div
            className={`rounded-lg overflow-hidden bg-[var(--diagram-canvas)] p-3 ${compactLayout ? "my-3" : "my-4"}`}
          >
            <Image
              src={question.imageUrl}
              alt="Question illustration"
              width={600}
              height={400}
              className={`diagram-raster w-full object-contain ${compactLayout ? "max-h-[220px]" : "max-h-[300px]"}`}
            />
          </div>
        )}

        {question.diagram && (
          <AdaptiveDiagramViewport
            className={compactLayout ? "my-3" : "my-4"}
            maxHeightClassName={compactLayout ? "max-h-[300px]" : "max-h-[380px]"}
          >
            <DiagramRenderer diagram={question.diagram} />
          </AdaptiveDiagramViewport>
        )}

        <div
          className={`rounded-lg transition-colors mb-3 ${
            isQuestionAndChoicesReading ? "bg-primary/10 px-3 py-2" : ""
          }`}
        >
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

        {feedbackSlot}

        {belowOptionsSlot}

      </motion.div>
    </AnimatePresence>
  );
}
