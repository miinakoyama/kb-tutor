"use client";

import { ReactNode } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Square, Volume2 } from "lucide-react";
import type { Question, AnswerRecord } from "@/types/question";
import { OptionButton } from "./OptionButton";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { useTextToSpeech, type ReadSection } from "@/hooks/useTextToSpeech";
import { buildChoicesReadText } from "@/lib/tts-utils";

interface QuestionDisplayProps {
  question: Question;
  questionNumber: number;
  currentAnswer?: AnswerRecord;
  onOptionClick: (optionId: string) => void;
  renderQuestionText?: (text: string) => ReactNode;
  feedbackSlot?: ReactNode;
  feedbackReadText?: string;
  belowOptionsSlot?: ReactNode;
  showOptionFeedbackIcons?: boolean;
}

function ReadAloudButton({
  section,
  label,
  text,
  isSpeaking,
  currentSection,
  onToggle,
  disabled = false,
}: {
  section: ReadSection;
  label: string;
  text: string;
  isSpeaking: boolean;
  currentSection: ReadSection | null;
  onToggle: (section: ReadSection, text: string) => void;
  disabled?: boolean;
}) {
  const isCurrent = isSpeaking && currentSection === section;

  return (
    <button
      type="button"
      onClick={() => onToggle(section, text)}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#16a34a]/30 text-[#166534] hover:bg-[#16a34a]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      aria-label={isCurrent ? `${label} reading. Stop.` : `Read ${label}`}
      aria-pressed={isCurrent}
    >
      {isCurrent ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      {isCurrent ? "Stop" : label}
    </button>
  );
}

export function QuestionDisplay({
  question,
  questionNumber,
  currentAnswer,
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
        <p className="text-sm text-slate-gray/60 mb-3">Question {questionNumber}</p>

        {isSupported && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ReadAloudButton
              section="question"
              label="Read Question"
              text={question.text}
              isSpeaking={isSpeaking}
              currentSection={currentSection}
              onToggle={toggleSpeak}
            />
          </div>
        )}

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

        {question.diagram && (
          <div className="my-4">
            <DiagramRenderer diagram={question.diagram} />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
            Choices
          </p>
          {isSupported && (
            <ReadAloudButton
              section="choices"
              label="Read Choices"
              text={choicesReadText}
              isSpeaking={isSpeaking}
              currentSection={currentSection}
              onToggle={toggleSpeak}
            />
          )}
        </div>

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

        {isSupported && isAnswered && feedbackReadText && (
          <div className="mt-4 mb-2">
            <ReadAloudButton
              section="feedback"
              label="Read Feedback"
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
