"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import type { Question, AnswerRecord } from "@/types/question";
import { OptionButton } from "@/components/shared/OptionButton";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { ExamNavigator } from "@/components/shared/ExamNavigator";
import { Timer } from "@/components/shared/Timer";
import { PracticeHeader } from "@/components/shared/PracticeHeader";
import { saveAnswerBatch } from "@/lib/storage";

const PRIMARY_COLOR = "#16a34a";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface ExamModeProps {
  questions: Question[];
  topicName?: string;
  requestedQuestionCount?: number;
}

type ExamPhase = "config" | "exam" | "confirm" | "results" | "review";

export function ExamMode({
  questions,
  topicName,
  requestedQuestionCount,
}: ExamModeProps) {
  const [phase, setPhase] = useState<ExamPhase>(
    requestedQuestionCount ? "exam" : "config"
  );
  const [questionCount, setQuestionCount] = useState(
    requestedQuestionCount ?? 20
  );
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>(() => {
    if (requestedQuestionCount) {
      const shuffled = shuffleArray(questions);
      return shuffled.slice(0, requestedQuestionCount);
    }
    return [];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>({});
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const elapsedRef = useRef(0);

  const totalQuestions = sessionQuestions.length;
  const answeredCount = Object.values(answers).filter((a) => a.selectedOptionId).length;
  const unansweredCount = totalQuestions - answeredCount;
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const startExam = useCallback(() => {
    const count = Math.min(questionCount, questions.length);
    const shuffled = shuffleArray(questions);
    setSessionQuestions(shuffled.slice(0, count));
    setAnswers({});
    setCurrentIndex(0);
    setPhase("exam");
  }, [questionCount, questions]);

  const handleOptionClick = useCallback(
    (optionId: string) => {
      if (answers[currentIndex]?.selectedOptionId) return;
      const q = sessionQuestions[currentIndex];
      if (!q) return;
      const isCorrect = optionId === q.correctOptionId;
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: { ...prev[currentIndex], selectedOptionId: optionId, isCorrect },
      }));
    },
    [currentIndex, answers, sessionQuestions]
  );

  const toggleFlag = useCallback(() => {
    setAnswers((prev) => {
      const existing = prev[currentIndex];
      const currentFlagged = existing?.flagged ?? false;
      return {
        ...prev,
        [currentIndex]: { ...existing, flagged: !currentFlagged },
      };
    });
  }, [currentIndex]);

  const handleSubmit = useCallback(() => {
    setPhase("confirm");
  }, []);

  const confirmSubmit = useCallback(() => {
    const batch = sessionQuestions.map((q, i) => {
      const a = answers[i];
      return {
        questionId: q.id,
        selectedOptionId: a?.selectedOptionId ?? "",
        isCorrect: a?.isCorrect ?? false,
        timestamp: Date.now(),
        mode: "exam" as const,
      };
    });
    saveAnswerBatch(batch.filter((b) => b.selectedOptionId));
    setPhase("results");
  }, [answers, sessionQuestions]);

  if (phase === "config") {
    return (
      <ExamConfig
        maxQuestions={questions.length}
        questionCount={questionCount}
        setQuestionCount={setQuestionCount}
        onStart={startExam}
        topicName={topicName}
      />
    );
  }

  if (phase === "confirm") {
    return (
      <ConfirmDialog
        unansweredCount={unansweredCount}
        onConfirm={confirmSubmit}
        onCancel={() => setPhase("exam")}
      />
    );
  }

  if (phase === "results") {
    const correctCount = Object.values(answers).filter((a) => a.isCorrect).length;
    return (
      <ExamResults
        questions={sessionQuestions}
        answers={answers}
        correctCount={correctCount}
        totalQuestions={totalQuestions}
        elapsedMs={elapsedRef.current}
        topicName={topicName}
        onReview={(index) => {
          setReviewIndex(index);
          setPhase("review");
        }}
        onRetry={() => {
          setPhase("config");
          setAnswers({});
          setCurrentIndex(0);
        }}
      />
    );
  }

  if (phase === "review" && reviewIndex !== null) {
    const q = sessionQuestions[reviewIndex];
    const a = answers[reviewIndex];
    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setPhase("results")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-4"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
            <ArrowLeft className="w-4 h-4 text-[#14532d]" />
          </span>
          Back to Results
        </button>
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-4 sm:p-6 shadow-sm">
          <p className="text-sm text-slate-gray/60 mb-3">
            Question {reviewIndex + 1}
          </p>
          <p className="text-base font-medium text-slate-gray leading-relaxed mb-5">
            {q.text}
          </p>
          <div className="space-y-2.5">
            {q.options.map((opt) => {
              const isSelected = a?.selectedOptionId === opt.id;
              const showCorrect = opt.id === q.correctOptionId;
              const showWrong = isSelected && opt.id !== q.correctOptionId;
              return (
                <OptionButton
                  key={opt.id}
                  option={opt}
                  isSelected={isSelected}
                  showCorrect={showCorrect}
                  showWrong={showWrong}
                  isAnswered={true}
                  onSelect={() => {}}
                  showFeedbackIcon
                />
              );
            })}
          </div>
          {a && (
            <FeedbackPanel
              question={q}
              answer={a}
              showKeyKnowledge
              showMisconception
            />
          )}
        </div>
      </div>
    );
  }

  const question = sessionQuestions[currentIndex];
  const currentAnswer = answers[currentIndex];

  const isTopicQuiz = topicName?.startsWith("Topic Quiz:");
  const displayTopicName = isTopicQuiz
    ? topicName?.replace("Topic Quiz: ", "")
    : topicName;
  const backHref = isTopicQuiz && question
    ? `/practice?module=${question.module}&topic=${encodeURIComponent(question.topic)}`
    : "/";
  const modeLabel = isTopicQuiz ? "Topic Quiz" : "Mock Exam";

  return (
    <div className="flex flex-col h-full">
      <PracticeHeader
        topicName={displayTopicName}
        mode="exam"
        modeLabel={modeLabel}
        backHref={backHref}
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
        answeredCount={answeredCount}
      />

      <div className="flex-shrink-0 mb-3">
        <div className="flex items-center justify-end gap-4">
          <Timer
            isRunning={phase === "exam"}
            onElapsedChange={(ms) => {
              elapsedRef.current = ms;
            }}
          />
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-semibold rounded-2xl border border-[#16a34a] text-[#16a34a] hover:bg-[#16a34a]/10 transition-colors"
          >
            Submit
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={question.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className="rounded-xl border border-[#16a34a]/30 bg-white p-4 sm:p-6 shadow-sm"
            >
              <p className="text-sm text-slate-gray/60 mb-3">
                Question {currentIndex + 1}
              </p>
              <p className="text-base font-medium text-slate-gray leading-relaxed mb-5 whitespace-pre-wrap">
                {question.text}
              </p>
              <div className="space-y-2.5">
                {question.options.map((opt) => {
                  const isSelected = currentAnswer?.selectedOptionId === opt.id;
                  return (
                    <OptionButton
                      key={opt.id}
                      option={opt}
                      isSelected={isSelected}
                      showCorrect={false}
                      showWrong={false}
                      isAnswered={!!currentAnswer?.selectedOptionId}
                      onSelect={handleOptionClick}
                    />
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="hidden lg:block w-96 flex-shrink-0">
          <ExamNavigator
            totalQuestions={totalQuestions}
            currentIndex={currentIndex}
            answers={answers}
            onNavigate={setCurrentIndex}
          />
        </div>
      </div>

      <div className="flex-shrink-0 pt-3">
        <div className="flex items-center justify-between bg-[#f8faf8] rounded-xl p-3 border border-[#16a34a]/20">
          <button
            onClick={() => currentIndex > 0 && setCurrentIndex((i) => i - 1)}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-gray/20 bg-white text-slate-gray font-medium hover:bg-slate-gray/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <button
            onClick={toggleFlag}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              answers[currentIndex]?.flagged
                ? "text-amber-600 bg-amber-50 border border-amber-200"
                : "text-slate-gray/50 hover:text-slate-gray/70 border border-slate-gray/15 hover:border-slate-gray/30"
            }`}
          >
            <Flag
              className={`w-4 h-4 ${answers[currentIndex]?.flagged ? "fill-amber-500" : ""}`}
            />
            Mark for review
          </button>

          <button
            onClick={() =>
              currentIndex < totalQuestions - 1 &&
              setCurrentIndex((i) => i + 1)
            }
            disabled={currentIndex === totalQuestions - 1}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExamConfig({
  maxQuestions,
  questionCount,
  setQuestionCount,
  onStart,
  topicName,
}: {
  maxQuestions: number;
  questionCount: number;
  setQuestionCount: (n: number) => void;
  onStart: () => void;
  topicName?: string;
}) {
  const options = [
    { count: 20, label: "Quick", description: "~20 min" },
    { count: 32, label: "Module", description: "~35 min" },
    { count: 64, label: "Full Exam", description: "~60 min" },
  ].filter((o) => o.count <= maxQuestions || o.count === 20);

  const isFullExam = !topicName || topicName === "Full Mock Exam";

  return (
    <div className="max-w-lg mx-auto pt-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-4"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
          <ArrowLeft className="w-4 h-4 text-[#14532d]" />
        </span>
        Back to Home
      </Link>

      <div className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-gray mb-1">
          {isFullExam ? "Mock Exam" : topicName}
        </h2>
        <p className="text-sm text-slate-gray/60 mb-6">
          {isFullExam
            ? "Choose the number of questions for your practice exam."
            : "Questions will be drawn from all topics."}
        </p>

        <div className="space-y-3 mb-6">
          {options.map((opt) => {
            const effective = Math.min(opt.count, maxQuestions);
            const isActive = questionCount === effective;
            return (
              <button
                key={opt.count}
                onClick={() => setQuestionCount(effective)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isActive
                    ? "border-[#16a34a] bg-[#16a34a]/5"
                    : "border-slate-gray/15 hover:border-slate-gray/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-semibold text-slate-gray">
                      {opt.label}
                    </span>
                    <span className="text-sm text-slate-gray/50 ml-2">
                      {effective} questions
                    </span>
                  </div>
                  <span className="text-sm text-slate-gray/50">
                    {opt.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={onStart}
          className="w-full py-3 rounded-xl text-white font-semibold bg-[#16a34a] hover:bg-[#15803d] transition-colors"
        >
          Start Exam
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  unansweredCount,
  onConfirm,
  onCancel,
}: {
  unansweredCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white rounded-xl border border-[#16a34a]/30 shadow-xl p-6 max-w-sm w-[90vw]"
      >
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1 rounded-lg text-slate-gray/40 hover:text-slate-gray"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-lg font-bold text-slate-gray mb-2">
          Submit Exam?
        </h3>

        {unansweredCount > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              You have {unansweredCount} unanswered{" "}
              {unansweredCount === 1 ? "question" : "questions"}.
            </p>
          </div>
        )}

        <p className="text-sm text-slate-gray/70 mb-5">
          Once submitted, you cannot change your answers. Are you sure?
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-slate-gray/20 text-slate-gray font-medium hover:bg-slate-gray/5 transition-colors text-sm"
          >
            Go Back
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] transition-colors text-sm"
          >
            Submit
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ExamResults({
  questions,
  answers,
  correctCount,
  totalQuestions,
  elapsedMs,
  topicName,
  onReview,
  onRetry,
}: {
  questions: Question[];
  answers: Record<number, AnswerRecord>;
  correctCount: number;
  totalQuestions: number;
  elapsedMs: number;
  topicName?: string;
  onReview: (index: number) => void;
  onRetry: () => void;
}) {
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const minutes = Math.floor(elapsedMs / 60000);
  const avgSeconds =
    totalQuestions > 0 ? Math.round(elapsedMs / 1000 / totalQuestions) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-4 pb-8"
    >
      <div className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm text-center">
        {topicName && (
          <p className="text-sm text-slate-gray/70 mb-2">{topicName}</p>
        )}
        <h2 className="text-2xl font-bold text-slate-gray mb-4">
          Exam Complete!
        </h2>

        <p
          className="text-5xl font-bold mb-2"
          style={{ color: scorePercent >= 60 ? PRIMARY_COLOR : "#f87171" }}
        >
          {scorePercent}%
        </p>

        <div className="flex justify-center gap-6 mt-4 text-sm">
          <div className="text-center">
            <p className="text-lg font-bold text-[#16a34a]">{correctCount}</p>
            <p className="text-slate-gray/60">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-400">
              {totalQuestions - correctCount}
            </p>
            <p className="text-slate-gray/60">Incorrect</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-gray">{minutes}m</p>
            <p className="text-slate-gray/60">Total time</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-gray">{avgSeconds}s</p>
            <p className="text-slate-gray/60">Avg / question</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#16a34a]/30 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-gray mb-3">
          Review Questions
        </h3>
        <div className="space-y-2">
          {questions.map((q, index) => {
            const answer = answers[index];
            const isCorrect = answer?.isCorrect;
            const isFlagged = answer?.flagged;
            return (
              <button
                key={q.id}
                onClick={() => onReview(index)}
                className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-slate-gray/5 ${
                  isCorrect
                    ? "border-[#16a34a]/20"
                    : answer
                      ? "border-red-200"
                      : "border-slate-gray/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-medium text-slate-gray/50 mt-0.5 w-5">
                    {index + 1}
                  </span>
                  <p className="flex-1 text-sm text-slate-gray line-clamp-1">
                    {q.text}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isFlagged && (
                      <Flag className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    )}
                    {isCorrect ? (
                      <CheckCircle2
                        className="w-4 h-4"
                        style={{ color: PRIMARY_COLOR }}
                      />
                    ) : answer ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <span className="text-xs text-slate-gray/40">—</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
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
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#14532d] hover:text-[#166534] transition-colors"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
            <ArrowLeft className="w-4 h-4 text-[#14532d]" />
          </span>
          Back to Home
        </Link>
      </div>
    </motion.div>
  );
}
