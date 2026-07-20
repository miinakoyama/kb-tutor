"use client";

import { ReactNode } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Question, AnswerRecord } from "@/types/question";
import { OptionButton } from "./OptionButton";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { AdaptiveDiagramViewport } from "@/components/diagrams/AdaptiveDiagramViewport";
import { useTextToSpeech, type ReadSection } from "@/hooks/useTextToSpeech";
import { useQuestionMedia } from "@/hooks/useQuestionMedia";
import { useShortViewport } from "@/hooks/useShortViewport";
import { buildChoicesReadText } from "@/lib/tts-utils";
import { optionLabelAtIndex } from "@/lib/mcq-options";
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
  /**
   * Force the compact layout on or off. When omitted, the card compacts
   * automatically on short viewports so the question fits without scrolling.
   */
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
  question: questionProp,
  questionNumber,
  questionMetaText,
  showHeader = true,
  headerAction,
  currentAnswer,
  selectedOptionId,
  pendingSelection = false,
  revealCorrectAnswer = true,
  compactLayout,
  onOptionClick,
  renderQuestionText,
  feedbackSlot,
  belowOptionsSlot,
  showOptionFeedbackIcons = false,
  onReadAloud,
  questionReadAloudTourId,
  choicesReadAloudTourId,
}: QuestionDisplayProps) {
  const { question: hydratedQuestion, isMediaPending } =
    useQuestionMedia(questionProp);
  const isShortViewport = useShortViewport();
  const compact = compactLayout ?? isShortViewport;
  const question = hydratedQuestion ?? questionProp;
  // Hold answers while a stripped image is loading: image-dependent questions
  // must not be answerable before the illustration is visible.
  const handleOptionClick = (optionId: string) => {
    if (isMediaPending) return;
    onOptionClick(optionId);
  };
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
        className={`border ${
          compact
            ? "rounded-2xl p-4 sm:p-5"
            : "rounded-[24px] p-5 sm:p-8 lg:p-10"
        }`}
        style={{
          background: "var(--assignment-glass-bg-strong)",
          borderColor: "var(--assignment-glass-border)",
          boxShadow: "var(--assignment-card-shadow)",
        }}
      >
        {showHeader && (
          <div className={`flex items-start justify-between gap-3 ${compact ? "mb-2" : "mb-6"}`}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Question {questionNumber}
              </p>
              {headerAction}
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
            </div>
          </div>
        )}

        <div
          className={`prose prose-sm max-w-none text-slate-gray ${
            compact ? "mb-4" : "mb-7"
          } rounded-lg transition-colors ${
            isQuestionAndChoicesReading ? "bg-primary/10 px-3 py-2" : ""
          }`}
        >
          {renderQuestionText ? (
            <div
              className={`whitespace-pre-wrap font-medium leading-relaxed ${
                compact ? "text-[15px]" : "text-[17px]"
              }`}
            >
              {renderQuestionText(question.text)}
            </div>
          ) : (
            <p
              className={`whitespace-pre-wrap font-medium leading-relaxed ${
                compact ? "text-[15px]" : "text-[17px]"
              }`}
            >
              {question.text}
            </p>
          )}
        </div>

        {question.imageUrl && (
          <div
            className={`rounded-lg overflow-hidden bg-[var(--diagram-canvas)] p-3 ${compact ? "my-3" : "my-7"}`}
          >
            <Image
              src={question.imageUrl}
              alt="Question illustration"
              width={600}
              height={400}
              className={`diagram-raster w-full object-contain ${compact ? "max-h-[min(220px,28vh)]" : "max-h-[min(300px,32vh)]"}`}
            />
          </div>
        )}

        {!question.imageUrl && question.hasImage && isMediaPending && (
          <div
            role="status"
            aria-label="Loading question image"
            className={`rounded-lg bg-[var(--diagram-canvas)] p-3 ${compact ? "my-3" : "my-7"}`}
          >
            <div
              className={`w-full animate-pulse rounded-md bg-slate-gray/10 ${compact ? "h-[min(180px,24vh)]" : "h-[min(240px,28vh)]"}`}
            />
          </div>
        )}

        {question.diagram && (
          <AdaptiveDiagramViewport
            className={compact ? "my-3" : "my-7"}
            maxHeightClassName={compact ? "max-h-[min(300px,32vh)]" : "max-h-[min(380px,38vh)]"}
          >
            <DiagramRenderer diagram={question.diagram} />
          </AdaptiveDiagramViewport>
        )}

        <div
          className={`rounded-lg transition-colors ${compact ? "mb-3" : "mb-7"} ${
            isQuestionAndChoicesReading ? "bg-primary/10 px-3 py-2" : ""
          }`}
        >
          <div className={`${compact ? "space-y-2 mt-1.5" : "space-y-3"}`}>
            {question.options.map((opt, optionIndex) => {
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
                  label={optionLabelAtIndex(optionIndex)}
                  isSelected={isSelected}
                  showCorrect={showCorrect}
                  showWrong={showWrong}
                  isAnswered={isAnswered}
                  onSelect={handleOptionClick}
                  showFeedbackIcon={showOptionFeedbackIcons}
                  pendingSelection={pendingSelection}
                  compact={compact}
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
