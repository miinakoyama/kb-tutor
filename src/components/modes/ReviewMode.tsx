"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Home, CheckCircle2, RotateCcw } from "lucide-react";
import type { Question, AnswerRecord, ConfidenceLevel } from "@/types/question";
import { QuestionDisplay } from "@/components/shared/QuestionDisplay";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { ConfidenceCheck } from "@/components/shared/ConfidenceCheck";
import { PracticeHeader } from "@/components/shared/PracticeHeader";
import { getIncorrectQuestionIds, saveAnswer } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";
import { buildFeedbackReadText } from "@/lib/tts-utils";
import { getStandardForTopic } from "@/lib/standards";
import { DEFAULT_STUDENT_ID, getStudentById } from "@/lib/mock-data";

const MAX_REVIEW_QUESTIONS = 10;

interface ReviewModeProps {
  questions: Question[];
  topicName?: string;
}

export function ReviewMode({ questions, topicName }: ReviewModeProps) {
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>({});
  const [showComplete, setShowComplete] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const incorrectIds = getIncorrectQuestionIds();
    const incorrectQuestions = questions.filter((q) =>
      incorrectIds.includes(q.id),
    );
    const shuffled = shuffleArray(incorrectQuestions);
    setReviewQuestions(shuffled.slice(0, MAX_REVIEW_QUESTIONS));
    setIsInitialized(true);
  }, [questions]);

  const question = reviewQuestions[currentIndex];
  const currentAnswer = answers[currentIndex];
  const totalQuestions = reviewQuestions.length;
  const feedbackReadText = useMemo(() => {
    if (!question || !currentAnswer) return "";
    return buildFeedbackReadText(question, currentAnswer, {
      includeKeyKnowledge: true,
      includeMisconception: true,
    });
  }, [question, currentAnswer]);

  const handleOptionClick = useCallback(
    (optionId: string) => {
      if (currentAnswer !== undefined || !question) return;
      const isCorrect = optionId === question.correctOptionId;
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: { selectedOptionId: optionId, isCorrect },
      }));
      const resolvedStandard = question.standardId
        ? { id: question.standardId, label: question.standardLabel }
        : getStandardForTopic(question.topic);
      const student = getStudentById(DEFAULT_STUDENT_ID);
      saveAnswer({
        questionId: question.id,
        selectedOptionId: optionId,
        isCorrect,
        timestamp: Date.now(),
        mode: "review",
        module: question.module,
        topic: question.topic,
        standardId: resolvedStandard.id,
        standardLabel: resolvedStandard.label,
        studentId: student?.id,
        classId: student?.classId,
        teacherId: student?.teacherId,
      });
    },
    [currentIndex, currentAnswer, question],
  );

  const handleConfidence = useCallback(
    (level: ConfidenceLevel) => {
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: { ...prev[currentIndex], confidenceLevel: level },
      }));
    },
    [currentIndex],
  );

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      });
    } else {
      setShowComplete(true);
    }
  }, [currentIndex, totalQuestions]);

  useEffect(() => {
    if (!currentAnswer) return;
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [currentAnswer, currentIndex]);

  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-gray">Loading questions...</div>
      </div>
    );
  }

  if (reviewQuestions.length === 0 || !question) {
    return (
      <div className="max-w-lg mx-auto pt-8">
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-[#16a34a] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-gray mb-2">
            Nothing to Review!
          </h2>
          <p className="text-sm text-slate-gray/60 mb-6">
            You haven&apos;t gotten any questions wrong yet, or you haven&apos;t
            practiced any questions. Try some practice first!
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] transition-colors"
          >
            <Home className="w-4 h-4" />
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (showComplete) {
    const correctCount = Object.values(answers).filter(
      (a) => a.isCorrect,
    ).length;
    const scorePercent = Math.round((correctCount / totalQuestions) * 100);
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg mx-auto space-y-4 pt-8"
      >
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm text-center">
          <h2 className="text-2xl font-bold text-slate-gray mb-2">
            Review Complete!
          </h2>
          <p className="text-4xl font-bold text-[#16a34a] mb-1">
            {scorePercent}%
          </p>
          <p className="text-sm text-slate-gray/60">
            {correctCount} of {totalQuestions} correct
          </p>
          {scorePercent < 100 && (
            <p className="text-sm text-slate-gray/50 mt-3">
              Keep practicing! Review again to address remaining gaps.
            </p>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              setAnswers({});
              setCurrentIndex(0);
              setShowComplete(false);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Review Again
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

  const backHref = question
    ? `/practice?module=${question.module}&topic=${encodeURIComponent(question.topic)}`
    : "/";

  return (
    <div className="flex flex-col h-full">
      <PracticeHeader
        topicName={topicName}
        mode="review"
        backHref={backHref}
        inlineProgress
        compactSpacing
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 pb-4">
        <QuestionDisplay
          question={question}
          questionNumber={currentIndex + 1}
          currentAnswer={currentAnswer}
          compactLayout
          onOptionClick={handleOptionClick}
          showOptionFeedbackIcons
          feedbackReadText={feedbackReadText}
          feedbackSlot={
            currentAnswer ? (
              <div className="space-y-4">
                <FeedbackPanel
                  question={question}
                  answer={currentAnswer}
                  showKeyKnowledge
                  showMisconception
                />
                <ConfidenceCheck
                  value={currentAnswer.confidenceLevel}
                  onChange={handleConfidence}
                />
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="flex-shrink-0 pt-2">
        <div className="flex justify-end bg-[#f8faf8] rounded-xl p-2.5 border border-[#16a34a]/20">
          <button
            onClick={handleNext}
            disabled={!currentAnswer}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
          >
            {currentIndex === totalQuestions - 1 ? "Finish" : "Next"}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
