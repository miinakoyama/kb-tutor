"use client";

import { useState, useCallback, useMemo, useEffect, ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  Lightbulb,
  ArrowLeft,
  Bookmark,
} from "lucide-react";
import type { Question, AnswerRecord, ConfidenceLevel, GlossaryTerm } from "@/types/question";
import { QuestionDisplay } from "@/components/shared/QuestionDisplay";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { ConfidenceCheck } from "@/components/shared/ConfidenceCheck";
import { GlossaryPanel } from "@/components/shared/GlossaryPanel";
import { GlossaryPopover } from "@/components/shared/GlossaryPopover";
import { PracticeHeader } from "@/components/shared/PracticeHeader";
import { saveAnswer, isBookmarked, toggleBookmark } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";
import { getTermsById, getAllGlossaryTerms } from "@/lib/glossary-utils";

const QUESTIONS_PER_SESSION = 5;
const allGlossaryTerms = getAllGlossaryTerms();

interface GuidedModeProps {
  questions: Question[];
  topicName?: string;
}

export function GuidedMode({ questions, topicName }: GuidedModeProps) {
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const shuffled = shuffleArray(questions);
    const selected = shuffled.slice(0, QUESTIONS_PER_SESSION);
    setSessionQuestions(selected);
    
    const bookmarked = selected.map((q) => q.id).filter((id) => isBookmarked(id));
    setBookmarkedQuestions(new Set(bookmarked));
    setIsInitialized(true);
  }, [questions]);

  const question = sessionQuestions[currentIndex];
  const isCurrentBookmarked = question ? bookmarkedQuestions.has(question.id) : false;
  const currentAnswer = answers[currentIndex];
  const totalQuestions = sessionQuestions.length;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === totalQuestions;
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const inlineTermIds = useMemo(
    () => new Set(question?.inlineTermIds ?? []),
    [question]
  );

  const sidebarTerms = useMemo(() => {
    if (!question?.sidebarTermIds) return [];
    const filteredIds = question.sidebarTermIds.filter((id) => !inlineTermIds.has(id));
    return getTermsById(filteredIds);
  }, [question, inlineTermIds]);

  const inlineTermMap = useMemo(() => {
    if (!question?.inlineTermIds) return new Map<string, GlossaryTerm>();
    const map = new Map<string, GlossaryTerm>();
    for (const id of question.inlineTermIds) {
      const term = allGlossaryTerms.find((t) => t.id === id);
      if (term) {
        map.set(term.term.toLowerCase(), term);
        const baseWord = term.term.split(" ")[0].toLowerCase();
        if (baseWord.length > 4) {
          map.set(baseWord + "s", term);
          map.set(baseWord + "ic", term);
          map.set(baseWord + "es", term);
        }
      }
    }
    return map;
  }, [question]);

  const renderQuestionText = useCallback(
    (text: string): ReactNode => {
      if (inlineTermMap.size === 0) return text;

      const terms = Array.from(inlineTermMap.keys()).sort(
        (a, b) => b.length - a.length
      );
      const pattern = new RegExp(
        `\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
        "gi"
      );
      const parts = text.split(pattern);

      return parts.map((part, i) => {
        const termData = inlineTermMap.get(part.toLowerCase());
        if (termData) {
          return (
            <GlossaryPopover key={i} term={termData}>
              {part}
            </GlossaryPopover>
          );
        }
        return part;
      });
    },
    [inlineTermMap]
  );

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
        mode: "guided",
      });
    },
    [currentIndex, currentAnswer, question]
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

  const handleBookmarkToggle = useCallback(() => {
    if (!question) return;
    const newState = toggleBookmark(question.id);
    setBookmarkedQuestions((prev) => {
      const next = new Set(prev);
      if (newState) {
        next.add(question.id);
      } else {
        next.delete(question.id);
      }
      return next;
    });
  }, [question]);

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

  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-gray">Loading questions...</div>
      </div>
    );
  }

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
      <GuidedSummary
        scorePercent={scorePercent}
        correctCount={correctCount}
        totalQuestions={totalQuestions}
        topicName={topicName}
        onRetry={() => {
          setAnswers({});
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
        mode="guided"
        backHref={backHref}
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
      />

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 pb-4">
            <QuestionDisplay
              question={question}
              questionNumber={currentIndex + 1}
              currentAnswer={currentAnswer}
              onOptionClick={handleOptionClick}
              renderQuestionText={renderQuestionText}
              showOptionFeedbackIcons
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
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleBookmarkToggle}
                        className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
                          isCurrentBookmarked
                            ? "text-[#16a34a] font-medium"
                            : "text-slate-gray/50 hover:text-slate-gray/70"
                        }`}
                      >
                        <Bookmark
                          className={`w-4 h-4 ${isCurrentBookmarked ? "fill-[#16a34a]" : ""}`}
                        />
                        {isCurrentBookmarked ? "Bookmarked" : "Bookmark"}
                      </button>
                    </div>
                  </div>
                ) : undefined
              }
              belowOptionsSlot={
                !currentAnswer && question.focusHint ? (
                  <div className="mt-4 p-3 rounded-xl border border-[#16a34a]/20 bg-[#16a34a]/5">
                    <div className="flex items-start gap-2.5">
                      <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#16a34a]" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a] mb-0.5">
                          Focus
                        </p>
                        <p className="text-sm text-slate-gray/80 leading-relaxed">
                          {question.focusHint}
                        </p>
                      </div>
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
                disabled={!currentAnswer}
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

        <div className="lg:w-72 flex-shrink-0">
          <GlossaryPanel terms={sidebarTerms} defaultOpen title="Definitions" />
        </div>
      </div>
    </div>
  );
}

function GuidedSummary({
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
          Guided Practice Complete!
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
