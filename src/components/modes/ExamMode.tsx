"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import type { Question, AnswerRecord } from "@/types/question";
import { OptionButton } from "@/components/shared/OptionButton";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { ExamNavigator } from "@/components/shared/ExamNavigator";
import { Timer } from "@/components/shared/Timer";
import { PracticeHeader } from "@/components/shared/PracticeHeader";
import { saveAnswerBatch } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { buildChoicesReadText, buildFeedbackReadText } from "@/lib/tts-utils";
import { ReadAloudButton } from "@/components/shared/ReadAloudButton";
import { getStandardForTopic } from "@/lib/standards";
import { DEFAULT_STUDENT_ID, getStudentById } from "@/lib/mock-data";

const PRIMARY_COLOR = "#16a34a";

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
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>({});
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [isNavigatorPinnedOpen, setIsNavigatorPinnedOpen] = useState(false);
  const [isNavigatorHovered, setIsNavigatorHovered] = useState(false);
  const [supportsHover, setSupportsHover] = useState(false);
  const elapsedRef = useRef(0);
  const [isInitialized, setIsInitialized] = useState(!requestedQuestionCount);
  const {
    isSupported,
    isSpeaking,
    currentSection,
    toggleSpeak,
  } = useTextToSpeech();
  const isQuestionReading = isSpeaking && currentSection === "question";
  const isChoicesReading = isSpeaking && currentSection === "choices";
  const isFeedbackReading = isSpeaking && currentSection === "feedback";

  useEffect(() => {
    if (requestedQuestionCount) {
      if (questions.length > 0) {
        const shuffled = shuffleArray(questions);
        setSessionQuestions(shuffled.slice(0, requestedQuestionCount));
      }
      setIsInitialized(true);
    }
  }, [questions, requestedQuestionCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setSupportsHover(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const totalQuestions = sessionQuestions.length;
  const answeredCount = Object.values(answers).filter((a) => a.selectedOptionId).length;
  const unansweredCount = totalQuestions - answeredCount;
  const startExam = useCallback(() => {
    let selectedQuestions: Question[] = [];
    
    if (questionCount <= questions.length) {
      const shuffled = shuffleArray(questions);
      selectedQuestions = shuffled.slice(0, questionCount).map((q, idx) => ({
        ...q,
        _sessionIndex: idx,
      }));
    } else {
      const shuffled = shuffleArray(questions);
      let tempQuestions = [...shuffled];
      
      while (tempQuestions.length < questionCount) {
        const reshuffled = shuffleArray(questions);
        const remaining = questionCount - tempQuestions.length;
        tempQuestions = [...tempQuestions, ...reshuffled.slice(0, remaining)];
      }
      
      selectedQuestions = tempQuestions.map((q, idx) => ({
        ...q,
        _sessionIndex: idx,
      }));
    }
    
    setSessionQuestions(selectedQuestions);
    setAnswers({});
    setCurrentIndex(0);
    setPhase("exam");
  }, [questionCount, questions]);

  const handleOptionClick = useCallback(
    (optionId: string) => {
      const q = sessionQuestions[currentIndex];
      if (!q) return;
      const isCorrect = optionId === q.correctOptionId;
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: { ...prev[currentIndex], selectedOptionId: optionId, isCorrect },
      }));
    },
    [currentIndex, sessionQuestions]
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
    const student = getStudentById(DEFAULT_STUDENT_ID);
    const timePerQuestion =
      sessionQuestions.length > 0
        ? Math.max(5, Math.round(elapsedRef.current / 1000 / sessionQuestions.length))
        : 0;
    const batch = sessionQuestions.map((q, i) => {
      const a = answers[i];
      const resolvedStandard = q.standardId
        ? { id: q.standardId, label: q.standardLabel }
        : getStandardForTopic(q.topic);
      return {
        questionId: q.id,
        selectedOptionId: a?.selectedOptionId ?? "",
        isCorrect: a?.isCorrect ?? false,
        timestamp: Date.now(),
        mode: "exam" as const,
        module: q.module,
        topic: q.topic,
        standardId: resolvedStandard.id,
        standardLabel: resolvedStandard.label,
        timeSpentSec: timePerQuestion,
        studentId: student?.id,
        classId: student?.classId,
        teacherId: student?.teacherId,
      };
    });
    saveAnswerBatch(batch.filter((b) => b.selectedOptionId));
    setPhase("results");
  }, [answers, sessionQuestions]);

  if (phase === "config") {
    return (
      <ExamConfig
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
    const reviewChoicesText = buildChoicesReadText(q);
    const reviewFeedbackText = buildFeedbackReadText(q, a, {
      includeKeyKnowledge: true,
      includeMisconception: true,
    });
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
          <p className="text-sm text-slate-gray/60 mb-3">Question {reviewIndex + 1}</p>
          {isSupported && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ReadAloudButton
                section="question"
                label="Question"
                text={q.text}
                isSpeaking={isSpeaking}
                currentSection={currentSection}
                onToggle={toggleSpeak}
              />
            </div>
          )}
          <p
            className={`text-base font-medium text-slate-gray leading-relaxed mb-4 rounded-lg transition-colors ${
              isQuestionReading ? "bg-[#16a34a]/10 px-3 py-2" : ""
            }`}
          >
            {q.text}
          </p>
          {q.diagram && (
            <div className="mb-5">
              <DiagramRenderer diagram={q.diagram} />
            </div>
          )}
          <div
            className={`rounded-lg transition-colors mt-4 ${
              isChoicesReading ? "bg-[#16a34a]/10 px-3 py-2" : ""
            }`}
          >
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
            {isSupported && (
              <div className="mt-4 mb-2">
              <ReadAloudButton
                section="choices"
                label="Choices"
                text={reviewChoicesText}
                isSpeaking={isSpeaking}
                currentSection={currentSection}
                onToggle={toggleSpeak}
              />
              </div>
            )}
          </div>
          {a?.selectedOptionId && (
            <>
              {isSupported && reviewFeedbackText && (
                <div
                  className={`mt-4 mb-2 rounded-lg transition-colors ${
                    isFeedbackReading ? "bg-[#16a34a]/10 px-3 py-2" : ""
                  }`}
                >
                  <ReadAloudButton
                    section="feedback"
                    label="Feedback"
                    text={reviewFeedbackText}
                    isSpeaking={isSpeaking}
                    currentSection={currentSection}
                    onToggle={toggleSpeak}
                  />
                </div>
              )}
              <FeedbackPanel
                question={q}
                answer={a}
                showKeyKnowledge
                showMisconception
              />
            </>
          )}
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-gray">Loading exam...</div>
      </div>
    );
  }

  if (sessionQuestions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-8 text-center max-w-md">
          <p className="text-slate-gray mb-4">
            No questions available for this topic yet. Please select a different topic or check back later.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg text-white font-medium transition-colors bg-[#16a34a] hover:bg-[#15803d]"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const question = sessionQuestions[currentIndex];
  const currentAnswer = answers[currentIndex];
  const choicesReadText = buildChoicesReadText(question);

  if (!question) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-gray">No questions available for this selection.</div>
      </div>
    );
  }

  const isTopicQuiz = topicName?.startsWith("Topic Quiz:");
  const displayTopicName = isTopicQuiz
    ? topicName?.replace("Topic Quiz: ", "")
    : topicName;
  const backHref = isTopicQuiz && question
    ? `/practice?module=${question.module}&topic=${encodeURIComponent(question.topic)}`
    : "/";
  const modeLabel = isTopicQuiz ? "Topic Quiz" : "Mock Exam";
  const unansweredLabel = Math.max(0, unansweredCount);
  const isNavigatorOpen = supportsHover
    ? isNavigatorHovered || isNavigatorPinnedOpen
    : isNavigatorPinnedOpen;

  return (
    <div className="flex flex-col h-full">
      <PracticeHeader
        topicName={displayTopicName}
        mode="exam"
        modeLabel={modeLabel}
        backHref={backHref}
        inlineProgress
        compactSpacing
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
        answeredCount={answeredCount}
      />

      <div className="flex-shrink-0 mb-1">
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

      <div className="flex-1 min-h-0 relative">
        <div className="h-full overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={question.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className="rounded-xl border border-[#16a34a]/30 bg-white p-4 sm:p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-base font-bold text-slate-gray">
                  Question {currentIndex + 1}
                </p>
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
              </div>
              <p
                className={`text-[15px] font-medium text-slate-gray leading-relaxed mb-3 whitespace-pre-wrap rounded-lg transition-colors ${
                  isQuestionReading ? "bg-[#16a34a]/10 px-3 py-2" : ""
                }`}
              >
                {question.text}
              </p>
              {question.diagram && (
                <div className="mb-4 rounded-lg overflow-auto border border-slate-gray/10 max-h-[240px]">
                  <DiagramRenderer diagram={question.diagram} />
                </div>
              )}
              <div
                className={`rounded-lg transition-colors ${
                  isChoicesReading ? "bg-[#16a34a]/10 px-3 py-2" : ""
                }`}
              >
                <div className="space-y-2 mt-1.5">
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
                        pendingSelection
                        compact
                      />
                    );
                  })}
                </div>
                {isSupported && (
                  <div className="mt-2">
                  <ReadAloudButton
                    section="choices"
                    label="Choices"
                    text={choicesReadText}
                    isSpeaking={isSpeaking}
                    currentSection={currentSection}
                    onToggle={toggleSpeak}
                  />
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {supportsHover ? (
          <button
            onMouseEnter={() => setIsNavigatorHovered(true)}
            onMouseLeave={() => setIsNavigatorHovered(false)}
            onClick={() => setIsNavigatorPinnedOpen((prev) => !prev)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 inline-flex flex-col items-center justify-center gap-1 w-8 h-20 rounded-l-lg border border-r-0 border-[#16a34a]/30 bg-white/95 text-[#166534] shadow-sm hover:bg-[#16a34a]/5 transition-colors"
            aria-label={isNavigatorOpen ? "Hide question navigator" : "Show question navigator"}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${isNavigatorOpen ? "translate-x-0.5" : ""}`} />
            {unansweredLabel > 0 && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-[#16a34a]/10 text-[#166534] text-[10px] font-semibold px-1">
                {unansweredLabel}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => setIsNavigatorPinnedOpen((prev) => !prev)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 inline-flex items-center gap-1 rounded-l-lg border border-r-0 border-[#16a34a]/30 bg-white/95 px-2 py-2 text-[#166534] shadow-sm hover:bg-[#16a34a]/5 transition-colors"
            aria-label={isNavigatorOpen ? "Hide question navigator" : "Show question navigator"}
          >
            {isNavigatorOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
            {unansweredLabel > 0 && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-[#16a34a]/10 text-[#166534] text-[10px] font-semibold px-1">
                {unansweredLabel}
              </span>
            )}
          </button>
        )}

        <AnimatePresence>
          {isNavigatorOpen && (
            <>
              {!supportsHover && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsNavigatorPinnedOpen(false)}
                  className="fixed inset-0 z-30 bg-black/10"
                  aria-label="Close question navigator overlay"
                />
              )}
              <motion.aside
                initial={{ x: 380, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 380, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="fixed right-0 top-16 bottom-0 z-40 w-[22rem] max-w-[92vw]"
                onMouseEnter={() => supportsHover && setIsNavigatorHovered(true)}
                onMouseLeave={() => supportsHover && setIsNavigatorHovered(false)}
              >
                <div className="h-full p-2">
                  <ExamNavigator
                    totalQuestions={totalQuestions}
                    currentIndex={currentIndex}
                    answers={answers}
                    onNavigate={(index) => {
                      setCurrentIndex(index);
                      if (!supportsHover) {
                        setIsNavigatorPinnedOpen(false);
                      }
                    }}
                  />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-shrink-0 pt-2">
        <div className="flex items-center justify-between bg-[#f8faf8] rounded-xl p-2.5 border border-[#16a34a]/20">
          <button
            onClick={() => currentIndex > 0 && setCurrentIndex((i) => i - 1)}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-gray/20 bg-white text-slate-gray font-medium hover:bg-slate-gray/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </button>

          <button
            onClick={toggleFlag}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              answers[currentIndex]?.flagged
                ? "text-amber-600 bg-amber-50 border border-amber-200"
                : "text-slate-gray/50 hover:text-slate-gray/70 border border-slate-gray/15 hover:border-slate-gray/30"
            }`}
          >
            <Flag
              className={`w-3.5 h-3.5 ${answers[currentIndex]?.flagged ? "fill-amber-500" : ""}`}
            />
            Mark for review
          </button>

          <button
            onClick={() =>
              currentIndex < totalQuestions - 1 &&
              setCurrentIndex((i) => i + 1)
            }
            disabled={currentIndex === totalQuestions - 1}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExamConfig({
  questionCount,
  setQuestionCount,
  onStart,
  topicName,
}: {
  questionCount: number;
  setQuestionCount: (n: number) => void;
  onStart: () => void;
  topicName?: string;
}) {
  const options = [
    { count: 20, label: "Quick", description: "~20 min" },
    { count: 32, label: "Module", description: "~35 min" },
    { count: 64, label: "Full Exam", description: "~60 min" },
  ];

  const isFullExam = !topicName || topicName === "Full Mock Exam";

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-4"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
            <ArrowLeft className="w-4 h-4 text-[#14532d]" />
          </span>
          Back to Home
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold font-heading text-[#14532d]">
          {isFullExam ? "Mock Exam" : topicName}
        </h1>
        <p className="text-sm text-slate-gray/60 mt-1">
          {isFullExam
            ? "Choose the number of questions for your practice exam"
            : "Questions will be drawn from all topics"}
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {options.map((opt) => {
          const isActive = questionCount === opt.count;
          return (
            <button
              key={opt.count}
              onClick={() => setQuestionCount(opt.count)}
              className={`w-full text-left p-5 rounded-3xl border bg-white shadow-sm transition-all ${
                isActive
                  ? "border-[#16a34a] shadow-md"
                  : "border-[#16a34a]/30 hover:border-[#16a34a] hover:shadow-md"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold text-slate-gray">
                    {opt.label}
                  </span>
                  <p className="text-xs text-[#16a34a] font-medium">
                    {opt.count} questions
                  </p>
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
        className="w-full py-3 rounded-2xl text-white font-semibold bg-[#16a34a] hover:bg-[#15803d] transition-colors shadow-sm"
      >
        Start Exam
      </button>
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
            const hasAnswer = !!answer?.selectedOptionId;
            const isCorrect = hasAnswer && answer?.selectedOptionId === q.correctOptionId;
            const isFlagged = answer?.flagged;
            return (
              <button
                key={index}
                onClick={() => onReview(index)}
                className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-slate-gray/5 ${
                  isCorrect
                    ? "border-[#16a34a]/20"
                    : hasAnswer
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
                    ) : hasAnswer ? (
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
