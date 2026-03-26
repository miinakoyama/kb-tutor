"use client";

import { useState, useMemo, useCallback, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  Bookmark,
  Lightbulb,
  Send,
  RefreshCcw,
} from "lucide-react";
import type { AnswerRecord, ConfidenceLevel, GlossaryTerm, Question } from "@/types/question";
import { QuestionDisplay } from "@/components/shared/QuestionDisplay";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { ConfidenceCheck } from "@/components/shared/ConfidenceCheck";
import { GlossaryPanel } from "@/components/shared/GlossaryPanel";
import { GlossaryPopover } from "@/components/shared/GlossaryPopover";
import { PracticeHeader } from "@/components/shared/PracticeHeader";
import { buildFeedbackReadText } from "@/lib/tts-utils";
import { isBookmarked, saveAnswer, toggleBookmark } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";
import { getStandardForTopic } from "@/lib/standards";
import { DEFAULT_STUDENT_ID, getStudentById } from "@/lib/mock-data";

const DEFAULT_QUESTION_COUNT = 10;
const MAX_ATTEMPTS = 3;

interface AdaptivePracticeModeProps {
  questions: Question[];
  topicName?: string;
  questionCount?: number;
  assignmentId?: string;
}

interface AttemptRecord {
  selectedOptionId: string;
  isCorrect: boolean;
}

export function AdaptivePracticeMode({
  questions,
  topicName,
  questionCount = DEFAULT_QUESTION_COUNT,
  assignmentId,
}: AdaptivePracticeModeProps) {
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [attemptsByIndex, setAttemptsByIndex] = useState<Record<number, AttemptRecord[]>>({});
  const [finalAnswers, setFinalAnswers] = useState<Record<number, AnswerRecord>>({});
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<Set<string>>(new Set());
  const [questionStartMs, setQuestionStartMs] = useState<number>(Date.now());
  const [showSummary, setShowSummary] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (questions.length === 0) return;
    const selected = shuffleArray(questions).slice(0, questionCount);
    setSessionQuestions(selected);
    setBookmarkedQuestions(new Set(selected.map((q) => q.id).filter((id) => isBookmarked(id))));
    setIsInitialized(true);
  }, [questions, questionCount]);

  useEffect(() => {
    setSelectedOptionId(null);
    setQuestionStartMs(Date.now());
  }, [currentIndex]);

  const question = sessionQuestions[currentIndex];
  const attempts = attemptsByIndex[currentIndex] ?? [];
  const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : undefined;
  const isCorrect = !!lastAttempt?.isCorrect;
  const isCompleted = isCorrect || attempts.length >= MAX_ATTEMPTS;
  const showScaffold = attempts.length >= 1 && !isCorrect;
  const canTryAgain = !isCompleted && attempts.length > 0 && !isCorrect;
  const finalAnswer = finalAnswers[currentIndex];
  const totalQuestions = sessionQuestions.length;
  const completedCount = Object.keys(finalAnswers).length;
  const allCompleted = completedCount === totalQuestions && totalQuestions > 0;

  const glossaryTerms = useMemo(() => {
    if (!question || !showScaffold) return [];
    const allTerms = [...(question.inlineTerms ?? []), ...(question.sidebarTerms ?? [])];
    const seen = new Set<string>();
    return allTerms.filter((term) => {
      if (seen.has(term.id)) return false;
      seen.add(term.id);
      return true;
    });
  }, [question, showScaffold]);

  const inlineTermMap = useMemo(() => {
    const map = new Map<string, GlossaryTerm>();
    if (!showScaffold) return map;
    for (const term of question?.inlineTerms ?? []) {
      map.set(term.term.toLowerCase(), term);
    }
    return map;
  }, [question, showScaffold]);

  const feedbackReadText = useMemo(() => {
    if (!question || !finalAnswer) return "";
    return buildFeedbackReadText(question, finalAnswer, {
      includeKeyKnowledge: true,
      includeMisconception: true,
    });
  }, [question, finalAnswer]);

  const renderQuestionText = useCallback(
    (text: string): ReactNode => {
      if (!showScaffold || inlineTermMap.size === 0) return text;
      const terms = Array.from(inlineTermMap.keys()).sort((a, b) => b.length - a.length);
      const pattern = new RegExp(
        `\\b(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
        "gi",
      );
      const parts = text.split(pattern);
      return parts.map((part, index) => {
        const term = inlineTermMap.get(part.toLowerCase());
        if (!term) return part;
        return (
          <GlossaryPopover key={`${term.id}_${index}`} term={term}>
            {part}
          </GlossaryPopover>
        );
      });
    },
    [inlineTermMap, showScaffold],
  );

  const submitAttempt = useCallback(() => {
    if (!question || !selectedOptionId || isCompleted) return;
    const result: AttemptRecord = {
      selectedOptionId,
      isCorrect: selectedOptionId === question.correctOptionId,
    };
    const nextAttempts = [...attempts, result];
    const elapsedSec = Math.max(5, Math.round((Date.now() - questionStartMs) / 1000));

    setAttemptsByIndex((prev) => ({ ...prev, [currentIndex]: nextAttempts }));
    setSelectedOptionId(null);
    setQuestionStartMs(Date.now());

    const shouldFinalize = result.isCorrect || nextAttempts.length >= MAX_ATTEMPTS;
    if (shouldFinalize) {
      const finalSelectedId = result.isCorrect ? result.selectedOptionId : question.correctOptionId;
      const finalRecord: AnswerRecord = {
        selectedOptionId: finalSelectedId,
        isCorrect: result.isCorrect,
      };
      setFinalAnswers((prev) => ({ ...prev, [currentIndex]: finalRecord }));
    }

    const standard = getStandardForTopic(question.topic);
    const student = getStudentById(DEFAULT_STUDENT_ID);
    saveAnswer({
      questionId: question.id,
      selectedOptionId: selectedOptionId,
      isCorrect: result.isCorrect,
      timestamp: Date.now(),
      mode: "adaptive",
      module: question.module,
      topic: question.topic,
      standardId: standard.id,
      standardLabel: standard.label,
      timeSpentSec: elapsedSec,
      assignmentId,
      studentId: student?.id,
      classId: student?.classId,
      teacherId: student?.teacherId,
    });
  }, [
    assignmentId,
    attempts,
    currentIndex,
    isCompleted,
    question,
    questionStartMs,
    selectedOptionId,
  ]);

  const handleConfidence = useCallback(
    (level: ConfidenceLevel) => {
      if (!finalAnswer) return;
      setFinalAnswers((prev) => ({
        ...prev,
        [currentIndex]: { ...finalAnswer, confidenceLevel: level },
      }));
    },
    [currentIndex, finalAnswer],
  );

  const handleBookmarkToggle = useCallback(() => {
    if (!question) return;
    const nextBookmarked = toggleBookmark(question.id);
    setBookmarkedQuestions((prev) => {
      const next = new Set(prev);
      if (nextBookmarked) next.add(question.id);
      else next.delete(question.id);
      return next;
    });
  }, [question]);

  const handleNext = useCallback(() => {
    if (!isCompleted) return;
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }
    if (allCompleted) {
      setShowSummary(true);
    }
  }, [allCompleted, currentIndex, isCompleted, totalQuestions]);

  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-gray">Loading questions...</div>
      </div>
    );
  }

  if (sessionQuestions.length === 0 || !question) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-8 text-center max-w-md">
          <p className="text-slate-gray mb-4">
            No questions available for this selection yet.
          </p>
          <Link
            href="/self-practice"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg text-white font-medium transition-colors bg-[#16a34a] hover:bg-[#15803d]"
          >
            Back to Self Practice
          </Link>
        </div>
      </div>
    );
  }

  if (showSummary) {
    const correctCount = Object.values(finalAnswers).filter((answer) => answer.isCorrect).length;
    const scorePercent = Math.round((correctCount / totalQuestions) * 100);
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg mx-auto space-y-4"
      >
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm text-center">
          {topicName && <p className="text-sm text-slate-gray/70 mb-2">{topicName}</p>}
          <h2 className="text-2xl font-bold text-slate-gray mb-2">Session Complete</h2>
          <p className="text-4xl font-bold text-[#16a34a] mb-1">{scorePercent}%</p>
          <p className="text-sm text-slate-gray/60">
            {correctCount} of {totalQuestions} final answers correct
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              setCurrentIndex(0);
              setAttemptsByIndex({});
              setFinalAnswers({});
              setShowSummary(false);
            }}
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

  const displayAnswer: AnswerRecord | undefined = isCompleted
    ? finalAnswer ?? { selectedOptionId: question.correctOptionId, isCorrect }
    : undefined;

  return (
    <div className="flex flex-col h-full">
      <PracticeHeader
        topicName={topicName}
        mode="adaptive"
        backHref="/self-practice"
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
        answeredCount={completedCount}
      />

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 pb-4">
            <QuestionDisplay
              question={question}
              questionNumber={currentIndex + 1}
              currentAnswer={displayAnswer}
              selectedOptionId={selectedOptionId}
              pendingSelection={!isCompleted && selectedOptionId !== null}
              onOptionClick={(optionId) => {
                if (isCompleted) return;
                setSelectedOptionId(optionId);
              }}
              renderQuestionText={renderQuestionText}
              showOptionFeedbackIcons={isCompleted}
              feedbackReadText={feedbackReadText}
              feedbackSlot={
                attempts.length > 0 ? (
                  <div className="space-y-4">
                    {isCompleted ? (
                      <>
                        <FeedbackPanel
                          question={question}
                          answer={displayAnswer ?? { selectedOptionId: question.correctOptionId, isCorrect: false }}
                          showKeyKnowledge
                          showMisconception
                        />
                        <ConfidenceCheck
                          value={finalAnswer?.confidenceLevel}
                          onChange={handleConfidence}
                        />
                        <button
                          onClick={handleBookmarkToggle}
                          className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
                            bookmarkedQuestions.has(question.id)
                              ? "text-[#16a34a] font-medium"
                              : "text-slate-gray/50 hover:text-slate-gray/70"
                          }`}
                        >
                          <Bookmark
                            className={`w-4 h-4 ${bookmarkedQuestions.has(question.id) ? "fill-[#16a34a]" : ""}`}
                          />
                          {bookmarkedQuestions.has(question.id) ? "Bookmarked" : "Bookmark"}
                        </button>
                      </>
                    ) : (
                      <>
                        <FeedbackPanel
                          question={question}
                          answer={{
                            selectedOptionId: lastAttempt?.selectedOptionId ?? "",
                            isCorrect: false,
                          }}
                        />
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          Attempt {attempts.length} of {MAX_ATTEMPTS}. Try again after reviewing the hint and glossary.
                        </div>
                      </>
                    )}
                  </div>
                ) : undefined
              }
              belowOptionsSlot={
                showScaffold && question.focusHint && !isCompleted ? (
                  <div className="mt-4 p-3 rounded-xl border border-[#16a34a]/20 bg-[#16a34a]/5">
                    <div className="flex items-start gap-2.5">
                      <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#16a34a]" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a] mb-0.5">
                          Focus Hint
                        </p>
                        <p className="text-sm text-slate-gray/80 leading-relaxed">{question.focusHint}</p>
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
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-gray/20 bg-white text-slate-gray font-medium hover:bg-slate-gray/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              {!isCompleted ? (
                canTryAgain ? (
                  <button
                    onClick={() => setSelectedOptionId(null)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-white font-medium bg-amber-500 hover:bg-amber-600 transition-colors text-sm"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Try Again
                  </button>
                ) : (
                  <button
                    onClick={submitAttempt}
                    disabled={!selectedOptionId}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    <Send className="w-4 h-4" />
                    Submit
                  </button>
                )
              ) : (
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] transition-colors text-sm"
                >
                  {currentIndex === totalQuestions - 1 ? "View Results" : "Next"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="lg:w-72 flex-shrink-0">
          <GlossaryPanel terms={glossaryTerms} title="Glossary" defaultOpen={showScaffold} />
        </div>
      </div>
    </div>
  );
}
