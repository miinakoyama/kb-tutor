"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  ArrowLeft,
  BookOpen,
  Bookmark,
} from "lucide-react";
import type {
  Question,
  AnswerRecord,
  ConfidenceLevel,
  GlossaryTerm,
} from "@/types/question";
import { QuestionDisplay } from "@/components/shared/QuestionDisplay";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { ConfidenceCheck } from "@/components/shared/ConfidenceCheck";
import { GlossaryPanel } from "@/components/shared/GlossaryPanel";
import { PracticeHeader } from "@/components/shared/PracticeHeader";
import { saveAnswer, addReviewLater, removeReviewLater } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";
import { getTermsById } from "@/lib/glossary-utils";

const QUESTIONS_PER_SESSION = 10;

interface PracticeModeProps {
  questions: Question[];
  topicName?: string;
}

export function PracticeMode({ questions, topicName }: PracticeModeProps) {
  const [sessionQuestions] = useState<Question[]>(() => {
    const shuffled = shuffleArray(questions);
    return shuffled.slice(0, QUESTIONS_PER_SESSION);
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>({});
  const [rationaleAnswers, setRationaleAnswers] = useState<
    Record<number, { selectedOptionId: string; isCorrect: boolean }>
  >({});
  const [showSummary, setShowSummary] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);

  const question = sessionQuestions[currentIndex];
  const currentAnswer = answers[currentIndex];
  const currentRationale = rationaleAnswers[currentIndex];
  const totalQuestions = sessionQuestions.length;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === totalQuestions;
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const glossaryTerms = useMemo(() => {
    if (!question) return [];
    const allIds = [
      ...(question.inlineTermIds || []),
      ...(question.sidebarTermIds || []),
    ];
    const unique = [...new Set(allIds)];
    return getTermsById(unique);
  }, [question]);

  const handleOptionClick = useCallback(
    (optionId: string) => {
      if (currentAnswer !== undefined || !question) return;
      const isCorrect = optionId === question.correctOptionId;
      const record: AnswerRecord = { selectedOptionId: optionId, isCorrect };
      setAnswers((prev) => ({ ...prev, [currentIndex]: record }));
      saveAnswer({
        questionId: question.id,
        selectedOptionId: optionId,
        isCorrect,
        timestamp: Date.now(),
        mode: "practice",
      });
    },
    [currentIndex, currentAnswer, question]
  );

  const handleRationaleClick = useCallback(
    (optionId: string) => {
      if (currentRationale || !question?.rationaleQuestion) return;
      const isCorrect = optionId === question.rationaleQuestion.correctOptionId;
      setRationaleAnswers((prev) => ({
        ...prev,
        [currentIndex]: { selectedOptionId: optionId, isCorrect },
      }));
    },
    [currentIndex, currentRationale, question]
  );

  const handleConfidence = useCallback(
    (level: ConfidenceLevel) => {
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: { ...prev[currentIndex], confidenceLevel: level },
      }));
    },
    [currentIndex]
  );

  const handleReviewLater = useCallback(
    (checked: boolean) => {
      if (!question) return;
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: { ...prev[currentIndex], reviewLater: checked },
      }));
      if (checked) {
        addReviewLater(question.id);
      } else {
        removeReviewLater(question.id);
      }
    },
    [currentIndex, question]
  );

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (allAnswered) {
      setShowSummary(true);
    }
  }, [currentIndex, totalQuestions, allAnswered]);

  if (sessionQuestions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-8 text-center text-slate-gray">
          No questions available for this topic.
        </div>
      </div>
    );
  }

  if (showSummary) {
    const correctCount = Object.values(answers).filter((a) => a.isCorrect).length;
    const scorePercent = Math.round((correctCount / totalQuestions) * 100);
    return (
      <PracticeSummary
        scorePercent={scorePercent}
        correctCount={correctCount}
        totalQuestions={totalQuestions}
        topicName={topicName}
        onRetry={() => {
          setAnswers({});
          setRationaleAnswers({});
          setCurrentIndex(0);
          setShowSummary(false);
        }}
      />
    );
  }

  const backHref = `/practice?module=${question.module}&topic=${encodeURIComponent(question.topic)}`;

  return (
    <div className="flex flex-col h-full">
      <PracticeHeader
        topicName={topicName}
        mode="practice"
        backHref={backHref}
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
      />

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-end mb-4 lg:hidden">
            <button
              onClick={() => setShowGlossary(!showGlossary)}
              className="inline-flex items-center gap-1.5 text-sm text-[#16a34a] hover:text-[#15803d] transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {showGlossary ? "Hide" : "View"} glossary
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pb-4">
            <QuestionDisplay
              question={question}
              questionNumber={currentIndex + 1}
              currentAnswer={currentAnswer}
              onOptionClick={handleOptionClick}
              showOptionFeedbackIcons
              feedbackSlot={
                currentAnswer ? (
                  <div className="space-y-4">
                    <FeedbackPanel
                      question={question}
                      answer={currentAnswer}
                      showKeyKnowledge
                    />

                    {question.rationaleQuestion && (
                      <RationaleQuestionBlock
                        rationaleQuestion={question.rationaleQuestion}
                        rationaleAnswer={currentRationale}
                        onSelect={handleRationaleClick}
                      />
                    )}

                    <ConfidenceCheck
                      value={currentAnswer.confidenceLevel}
                      onChange={handleConfidence}
                    />

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() =>
                          handleReviewLater(!currentAnswer.reviewLater)
                        }
                        className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
                          currentAnswer.reviewLater
                            ? "text-[#16a34a] font-medium"
                            : "text-slate-gray/50 hover:text-slate-gray/70"
                        }`}
                      >
                        <Bookmark
                          className={`w-4 h-4 ${currentAnswer.reviewLater ? "fill-[#16a34a]" : ""}`}
                        />
                        Review later
                      </button>
                    </div>
                  </div>
                ) : undefined
              }
            />
          </div>

          <div className="flex-shrink-0 pt-2">
            <div className="flex items-center justify-between bg-[#f8faf8] rounded-xl p-3 border border-[#16a34a]/20">
              <button
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-gray/20 bg-white text-slate-gray font-medium hover:bg-slate-gray/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={handleNext}
                disabled={!currentAnswer || (question.rationaleQuestion && !currentRationale)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {currentIndex === totalQuestions - 1 && allAnswered
                  ? "View Results"
                  : "Next"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className={`lg:w-72 flex-shrink-0 ${showGlossary ? "" : "hidden lg:block"}`}>
          <GlossaryPanel terms={glossaryTerms} title="Glossary" />
        </div>
      </div>
    </div>
  );
}

function RationaleQuestionBlock({
  rationaleQuestion,
  rationaleAnswer,
  onSelect,
}: {
  rationaleQuestion: NonNullable<Question["rationaleQuestion"]>;
  rationaleAnswer?: { selectedOptionId: string; isCorrect: boolean };
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 overflow-hidden">
      <div className="px-4 py-3 bg-amber-100/50 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20">
            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Follow-up Question</p>
            <p className="text-xs text-amber-700/70">Test your understanding of the concept</p>
          </div>
        </div>
      </div>
      
      <div className="p-4">
        <p className="text-sm font-medium text-slate-gray mb-3">
          {rationaleQuestion.text}
        </p>
        <div className="space-y-2">
          {rationaleQuestion.options.map((opt) => {
            const isSelected = rationaleAnswer?.selectedOptionId === opt.id;
            const isCorrect = opt.id === rationaleQuestion.correctOptionId;
            const isAnswered = !!rationaleAnswer;

            let borderColor = "rgba(31, 45, 31, 0.15)";
            let bgColor = "white";
            if (isAnswered && isCorrect) {
              borderColor = "#16a34a";
              bgColor = "rgba(22, 163, 74, 0.1)";
            } else if (isAnswered && isSelected && !isCorrect) {
              borderColor = "#f87171";
              bgColor = "rgba(248, 113, 113, 0.1)";
            }

            return (
              <button
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                disabled={isAnswered}
                className={`w-full text-left px-3 py-2.5 rounded-xl border-2 text-sm transition-all ${
                  !isAnswered ? "hover:border-amber-400 hover:bg-amber-50" : ""
                }`}
                style={{ borderColor, backgroundColor: bgColor }}
              >
                <span className="text-slate-gray">{opt.text}</span>
              </button>
            );
          })}
        </div>

        {rationaleAnswer && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 p-3 rounded-xl text-sm leading-relaxed ${
              rationaleAnswer.isCorrect 
                ? "bg-green-50 border border-green-200 text-green-800" 
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {rationaleQuestion.explanation}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function PracticeSummary({
  scorePercent,
  correctCount,
  totalQuestions,
  topicName,
  onRetry,
}: {
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  topicName?: string;
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto space-y-4"
    >
      <div className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm text-center">
        {topicName && (
          <p className="text-sm text-slate-gray/70 mb-2">{topicName}</p>
        )}
        <h2 className="text-2xl font-bold text-slate-gray mb-2">
          Practice Complete!
        </h2>
        <p className="text-4xl font-bold text-[#16a34a] mb-1">{scorePercent}%</p>
        <p className="text-sm text-slate-gray/60">
          {correctCount} of {totalQuestions} correct
        </p>
      </div>
      <div className="flex gap-3 justify-center">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Try Again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-gray/20 text-slate-gray font-medium hover:bg-slate-gray/5 transition-colors"
        >
          <Home className="w-4 h-4" />
          Home
        </Link>
      </div>
    </motion.div>
  );
}
