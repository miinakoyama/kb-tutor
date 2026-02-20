"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  ArrowLeft,
} from "lucide-react";
import type { Question } from "@/types/question";

const PRIMARY_COLOR = "#16a34a";
const PRIMARY_HOVER = "#15803d";
const PRIMARY_LIGHT = "rgba(22, 163, 74, 0.1)";
const QUESTIONS_PER_SESSION = 10;

interface MCQEngineProps {
  questions: Question[];
  topicName?: string;
  onComplete?: () => void;
}

interface AnswerRecord {
  selectedOptionId: string;
  isCorrect: boolean;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function MCQEngine({
  questions,
  topicName,
  onComplete,
}: MCQEngineProps) {
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (questions.length <= QUESTIONS_PER_SESSION) {
      setSessionQuestions(questions);
    } else {
      const shuffled = shuffleArray(questions);
      setSessionQuestions(shuffled.slice(0, QUESTIONS_PER_SESSION));
    }
    setIsInitialized(true);
  }, [questions]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const question = sessionQuestions[currentIndex];
  const currentAnswer = answers[currentIndex];
  const isAnswered = currentAnswer !== undefined;
  const totalQuestions = sessionQuestions.length;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === totalQuestions;

  const handleOptionClick = useCallback(
    (optionId: string) => {
      if (isAnswered) return;

      const isCorrect = optionId === question.correctOptionId;
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: {
          selectedOptionId: optionId,
          isCorrect,
        },
      }));
    },
    [currentIndex, isAnswered, question?.correctOptionId],
  );

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (allAnswered) {
      setShowSummary(true);
      setIsReviewing(false);
      onComplete?.();
    }
  }, [currentIndex, totalQuestions, allAnswered, onComplete]);

  const handleNavigate = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleRetry = useCallback(() => {
    setAnswers({});
    setCurrentIndex(0);
    setShowSummary(false);
    setIsReviewing(false);
  }, []);

  const handleReviewQuestion = useCallback((index: number) => {
    setShowSummary(false);
    setIsReviewing(true);
    setCurrentIndex(index);
  }, []);

  const handleBackToResults = useCallback(() => {
    setShowSummary(true);
    setIsReviewing(false);
  }, []);

  const correctCount = Object.values(answers).filter((a) => a.isCorrect).length;
  const incorrectCount = answeredCount - correctCount;
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-gray">Loading questions...</div>
      </div>
    );
  }

  if (showSummary) {
    return (
      <SummaryScreen
        questions={sessionQuestions}
        answers={answers}
        correctCount={correctCount}
        incorrectCount={incorrectCount}
        topicName={topicName}
        onRetry={handleRetry}
        onReviewQuestion={handleReviewQuestion}
      />
    );
  }

  if (!question || sessionQuestions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-8 text-center text-slate-gray">
          No questions available for this topic.
        </div>
      </div>
    );
  }

  const selectedOption = currentAnswer
    ? question.options.find((opt) => opt.id === currentAnswer.selectedOptionId)
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header */}
      <div className="flex-shrink-0 rounded-xl border border-[#16a34a]/30 bg-white px-4 sm:px-5 py-4 sm:py-5 shadow-sm">
        {/* Back to Results link when reviewing */}
        {isReviewing && (
          <button
            onClick={handleBackToResults}
            className="inline-flex items-center gap-1.5 text-sm font-medium mb-3 transition-colors"
            style={{ color: PRIMARY_COLOR }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = PRIMARY_HOVER;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = PRIMARY_COLOR;
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Results
          </button>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3">
            {topicName && (
              <h2 className="text-lg sm:text-xl font-semibold text-slate-gray">
                {topicName}
              </h2>
            )}
            <span className="text-sm text-slate-gray/60">
              Question {currentIndex + 1} of {totalQuestions}
            </span>
          </div>
          <span className="text-sm text-slate-gray/60">
            {progressPercent}% Complete
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-2 bg-slate-gray/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: PRIMARY_COLOR }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>

      {/* Scrollable Question Area */}
      <div className="flex-1 overflow-y-auto py-4 min-h-0">
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
              Question {currentIndex + 1}
            </p>

            <div className="prose prose-sm max-w-none text-slate-gray mb-5">
              <p className="whitespace-pre-wrap text-base font-medium leading-relaxed">
                {question.text}
              </p>
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
                  isAnswered &&
                  isSelected &&
                  opt.id !== question.correctOptionId;

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleOptionClick(opt.id)}
                    disabled={isAnswered}
                    className={`w-full text-left px-4 py-3 min-h-[48px] rounded-xl border-2 transition-all duration-200 break-words flex items-center gap-3 ${
                      isAnswered ? "cursor-default" : "cursor-pointer"
                    }`}
                    style={{
                      borderColor: showCorrect
                        ? PRIMARY_COLOR
                        : showWrong
                          ? "#f87171"
                          : isSelected
                            ? PRIMARY_COLOR
                            : "rgba(31, 45, 31, 0.2)",
                      backgroundColor: showCorrect
                        ? PRIMARY_LIGHT
                        : showWrong
                          ? "rgba(248, 113, 113, 0.1)"
                          : isSelected
                            ? PRIMARY_LIGHT
                            : "white",
                    }}
                    onMouseEnter={(e) => {
                      if (!isAnswered) {
                        e.currentTarget.style.borderColor = `${PRIMARY_COLOR}80`;
                        e.currentTarget.style.backgroundColor = PRIMARY_LIGHT;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isAnswered && !isSelected) {
                        e.currentTarget.style.borderColor =
                          "rgba(31, 45, 31, 0.2)";
                        e.currentTarget.style.backgroundColor = "white";
                      }
                    }}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: showCorrect
                          ? PRIMARY_COLOR
                          : showWrong
                            ? "#f87171"
                            : isSelected
                              ? PRIMARY_COLOR
                              : "rgba(31, 45, 31, 0.1)",
                        color:
                          showCorrect || showWrong || isSelected
                            ? "white"
                            : "#1f2d1f",
                      }}
                    >
                      {opt.id}
                    </span>
                    <span className="text-slate-gray">{opt.text}</span>
                  </button>
                );
              })}
            </div>

            {/* Feedback display */}
            {isAnswered && selectedOption?.feedback && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 p-4 rounded-xl border"
                style={{
                  backgroundColor: currentAnswer.isCorrect
                    ? PRIMARY_LIGHT
                    : "rgba(248, 113, 113, 0.1)",
                  borderColor: currentAnswer.isCorrect
                    ? `${PRIMARY_COLOR}40`
                    : "rgba(248, 113, 113, 0.3)",
                }}
              >
                <div className="flex items-start gap-3">
                  {currentAnswer.isCorrect ? (
                    <CheckCircle2
                      className="w-5 h-5 flex-shrink-0 mt-0.5"
                      style={{ color: PRIMARY_COLOR }}
                    />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      color: currentAnswer.isCorrect ? "#166534" : "#991b1b",
                    }}
                  >
                    {selectedOption.feedback}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Hint to select an answer */}
            {!isAnswered && (
              <p className="mt-5 text-center text-sm text-slate-gray/50 italic">
                Select an answer to see feedback
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Fixed Navigation */}
      <div className="flex-shrink-0 pt-4">
        <div className="flex items-center justify-between gap-2 sm:gap-4 bg-sand-beige rounded-xl p-3 border border-[#16a34a]/20">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-lg border border-slate-gray/20 bg-white text-slate-gray font-medium hover:bg-slate-gray/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          {/* Number navigation */}
          <div className="flex items-center gap-1 sm:gap-1.5 justify-center flex-wrap">
            {sessionQuestions.map((_, index) => {
              const answered = answers[index] !== undefined;
              const isCurrent = index === currentIndex;
              const isCorrectAnswer = answers[index]?.isCorrect;

              return (
                <button
                  key={index}
                  onClick={() => handleNavigate(index)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full text-xs sm:text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: isCurrent
                      ? PRIMARY_COLOR
                      : answered
                        ? isCorrectAnswer
                          ? PRIMARY_COLOR
                          : "#f87171"
                        : "white",
                    color: isCurrent || answered ? "white" : "#1f2d1f",
                    transform: isCurrent ? "scale(1.1)" : "scale(1)",
                    boxShadow: isCurrent
                      ? "0 2px 8px rgba(22, 163, 74, 0.3)"
                      : "0 1px 3px rgba(0, 0, 0, 0.1)",
                    border:
                      isCurrent || answered
                        ? "none"
                        : "1px solid rgba(31, 45, 31, 0.15)",
                  }}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <button
            onClick={isReviewing ? handleBackToResults : handleNext}
            disabled={
              !isReviewing &&
              currentIndex === totalQuestions - 1 &&
              !allAnswered
            }
            className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-lg text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: PRIMARY_COLOR }}
            onMouseEnter={(e) => {
              if (
                !(
                  !isReviewing &&
                  currentIndex === totalQuestions - 1 &&
                  !allAnswered
                )
              ) {
                e.currentTarget.style.backgroundColor = PRIMARY_HOVER;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = PRIMARY_COLOR;
            }}
          >
            <span className="hidden sm:inline">
              {isReviewing
                ? "View Results"
                : currentIndex === totalQuestions - 1 && allAnswered
                  ? "View Results"
                  : "Next"}
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface SummaryScreenProps {
  questions: Question[];
  answers: Record<number, AnswerRecord>;
  correctCount: number;
  incorrectCount: number;
  topicName?: string;
  onRetry: () => void;
  onReviewQuestion: (index: number) => void;
}

function SummaryScreen({
  questions,
  answers,
  correctCount,
  incorrectCount,
  topicName,
  onRetry,
  onReviewQuestion,
}: SummaryScreenProps) {
  const totalQuestions = questions.length;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);

  const getScoreMessage = () => {
    if (scorePercent === 100) return "Perfect! Excellent work!";
    if (scorePercent >= 80) return "Great job! Keep it up!";
    if (scorePercent >= 60) return "Good effort! Room for improvement.";
    if (scorePercent >= 40) return "Keep practicing! You're getting there.";
    return "Don't give up! Review and try again.";
  };

  const getScoreColor = () => {
    if (scorePercent >= 60) return PRIMARY_COLOR;
    return "#f87171";
  };

  return (
    <div className="h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 pb-4"
      >
        {/* Summary header */}
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm text-center">
          {topicName && (
            <p className="text-sm text-slate-gray/70 mb-2">{topicName}</p>
          )}
          <h2 className="text-2xl font-bold text-slate-gray mb-4">
            Quiz Complete!
          </h2>

          {/* Score circle */}
          <div className="relative w-28 h-28 mx-auto mb-4">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="48"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-slate-gray/10"
              />
              <motion.circle
                cx="56"
                cy="56"
                r="48"
                stroke={getScoreColor()}
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                initial={{ strokeDasharray: "0 302" }}
                animate={{
                  strokeDasharray: `${(scorePercent / 100) * 302} 302`,
                }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-2xl font-bold"
                style={{ color: getScoreColor() }}
              >
                {scorePercent}%
              </span>
            </div>
          </div>

          <p className="text-base font-medium text-slate-gray mb-2">
            {getScoreMessage()}
          </p>

          {/* Stats */}
          <div className="flex justify-center gap-6 mt-4">
            <div className="text-center">
              <div
                className="flex items-center justify-center gap-1.5"
                style={{ color: PRIMARY_COLOR }}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xl font-bold">{correctCount}</span>
              </div>
              <p className="text-xs text-slate-gray/70">Correct</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-red-400">
                <XCircle className="w-4 h-4" />
                <span className="text-xl font-bold">{incorrectCount}</span>
              </div>
              <p className="text-xs text-slate-gray/70">Incorrect</p>
            </div>
            <div className="text-center">
              <span className="text-xl font-bold text-slate-gray">
                {totalQuestions}
              </span>
              <p className="text-xs text-slate-gray/70">Total</p>
            </div>
          </div>
        </div>

        {/* All questions review */}
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-gray mb-3">
            Review Questions
          </h3>
          <div className="space-y-2">
            {questions.map((question, index) => {
              const answer = answers[index];
              const isCorrect = answer?.isCorrect;

              return (
                <button
                  key={question.id}
                  onClick={() => onReviewQuestion(index)}
                  className="w-full text-left p-3 rounded-lg border transition-colors"
                  style={{
                    backgroundColor: "white",
                    borderColor: isCorrect
                      ? `${PRIMARY_COLOR}30`
                      : "rgba(248, 113, 113, 0.3)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isCorrect
                      ? PRIMARY_LIGHT
                      : "rgba(248, 113, 113, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "white";
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                      style={{
                        backgroundColor: isCorrect
                          ? PRIMARY_LIGHT
                          : "rgba(248, 113, 113, 0.2)",
                        color: isCorrect ? PRIMARY_COLOR : "#dc2626",
                      }}
                    >
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-gray line-clamp-2">
                        {question.text}
                      </p>
                    </div>
                    {isCorrect ? (
                      <CheckCircle2
                        className="w-5 h-5 flex-shrink-0"
                        style={{ color: PRIMARY_COLOR }}
                      />
                    ) : (
                      <XCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg text-white font-medium transition-colors"
            style={{ backgroundColor: PRIMARY_COLOR }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = PRIMARY_HOVER;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = PRIMARY_COLOR;
            }}
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg text-white font-medium transition-colors"
            style={{ backgroundColor: PRIMARY_COLOR }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = PRIMARY_HOVER;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = PRIMARY_COLOR;
            }}
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
