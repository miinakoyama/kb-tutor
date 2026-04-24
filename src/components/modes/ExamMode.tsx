"use client";

import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
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
import { saveAnswer, saveAnswerBatch } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { AdaptiveDiagramViewport } from "@/components/diagrams/AdaptiveDiagramViewport";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { buildChoicesReadText, buildFeedbackReadText } from "@/lib/tts-utils";
import { ReadAloudButton } from "@/components/shared/ReadAloudButton";
import { FeatureSpotlight } from "@/components/shared/FeatureSpotlight";
import { getStandardForTopic } from "@/lib/standards";
import { DEFAULT_STUDENT_ID, getStudentById } from "@/lib/mock-data";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { useAnalyticsSession } from "@/lib/analytics/session";
import type { ReadSection } from "@/hooks/useTextToSpeech";

const PRIMARY_COLOR = "#16a34a";
const FOCUS_LOSS_FLUSH_GRACE_MS = 400;

const EXAM_ONBOARDING_DISMISSED_KEY = "kb-tutor-exam-onboarding-dismissed-v1";

const EXAM_ONBOARDING_TOUR_IDS = {
  NEXT_QUESTION: "exam-onboarding-next-question",
  /** Edge control that opens the question navigator (always visible). */
  NAVIGATOR_TOGGLE: "exam-onboarding-navigator-toggle",
  NAVIGATOR_PANEL: "exam-onboarding-navigator-panel",
  FLAG: "exam-onboarding-flag",
} as const;

type ExamOnboardingStep =
  | "intro"
  | "next"
  | "navigator-toggle"
  | "navigator"
  | "flag";

interface ExamModeProps {
  questions: Question[];
  topicName?: string;
  requestedQuestionCount?: number;
  assignmentId?: string;
  /**
   * Pre-answered questions keyed by question id, for assignment-mode resume.
   * When provided, the component trusts the server's question order, pre-fills
   * `answers`, jumps to the first unanswered index, and POSTs completion on
   * submit so the assignment is marked as Completed.
   */
  answered?: Record<
    string,
    { selectedOptionId: string | null; isCorrect: boolean; answeredAt: string }
  >;
  /** Fires when the completion API reports every school assignment is done. */
  onAllSchoolAssignmentsCompleted?: () => void;
}

type ExamPhase = "config" | "exam" | "confirm" | "results" | "review";

/** Seconds stored on attempts; `null` in DB means time was not measured. */
function dwellMsToRecordedSec(ms: number): number | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / 1000));
}

function nowMs(): number {
  return Date.now();
}

function isDocumentActiveForTiming(): boolean {
  if (typeof document === "undefined") return false;
  return !document.hidden && document.hasFocus();
}

export function ExamMode({
  questions,
  topicName,
  requestedQuestionCount,
  assignmentId,
  answered,
  onAllSchoolAssignmentsCompleted,
}: ExamModeProps) {
  const isAssignmentRun = Boolean(assignmentId) && answered !== undefined;
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
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isInitialized, setIsInitialized] = useState(!requestedQuestionCount);
  const [examOnboardingStep, setExamOnboardingStep] =
    useState<ExamOnboardingStep | null>(null);
  const [isNavigatorSpotlightReady, setIsNavigatorSpotlightReady] =
    useState(false);
  const examOnboardingOfferedRef = useRef(false);
  /** Cumulative time (ms) the learner had each question visible during the exam phase (multiple visits add up). */
  const questionDwellMsRef = useRef<Record<number, number>>({});
  const assignmentPersistedDwellMsRef = useRef<Record<number, number>>({});
  const visitRef = useRef<{ index: number; startMs: number } | null>(null);
  const blurFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurFlushTimer = useCallback(() => {
    if (blurFlushTimerRef.current === null) return;
    clearTimeout(blurFlushTimerRef.current);
    blurFlushTimerRef.current = null;
  }, []);

  const flushQuestionVisit = useCallback(() => {
    const v = visitRef.current;
    if (!v) return;
    const delta = Math.max(0, nowMs() - v.startMs);
    const prev = questionDwellMsRef.current[v.index] ?? 0;
    questionDwellMsRef.current[v.index] = prev + delta;
    visitRef.current = null;
  }, []);

  const resetExamDwellTracking = useCallback(() => {
    clearBlurFlushTimer();
    flushQuestionVisit();
    questionDwellMsRef.current = {};
    assignmentPersistedDwellMsRef.current = {};
  }, [clearBlurFlushTimer, flushQuestionVisit]);

  useEffect(() => {
    if (phase !== "exam" || examOnboardingStep !== null) return;
    // We flush before starting a new visit window so navigation between
    // questions does not leave overlapping active intervals.
    clearBlurFlushTimer();
    flushQuestionVisit();
    if (!isDocumentActiveForTiming()) return;
    visitRef.current = { index: currentIndex, startMs: nowMs() };
    return () => {
      clearBlurFlushTimer();
      flushQuestionVisit();
    };
  }, [
    clearBlurFlushTimer,
    currentIndex,
    examOnboardingStep,
    phase,
    flushQuestionVisit,
  ]);

  useEffect(() => {
    if (phase !== "exam" || examOnboardingStep !== null) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearBlurFlushTimer();
        flushQuestionVisit();
        return;
      }
      if (!document.hasFocus()) return;
      clearBlurFlushTimer();
      if (!visitRef.current) {
        visitRef.current = { index: currentIndex, startMs: nowMs() };
      }
    };
    const handleWindowBlur = () => {
      clearBlurFlushTimer();
      blurFlushTimerRef.current = setTimeout(() => {
        blurFlushTimerRef.current = null;
        flushQuestionVisit();
      }, FOCUS_LOSS_FLUSH_GRACE_MS);
    };
    const handleWindowFocus = () => {
      clearBlurFlushTimer();
      if (!isDocumentActiveForTiming()) return;
      if (!visitRef.current) {
        visitRef.current = { index: currentIndex, startMs: nowMs() };
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      clearBlurFlushTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [
    clearBlurFlushTimer,
    currentIndex,
    examOnboardingStep,
    flushQuestionVisit,
    phase,
  ]);

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
    if (!requestedQuestionCount) return;
    if (questions.length === 0) {
      setIsInitialized(true);
      return;
    }
    // For assignment runs, trust the server's deterministic ordering so
    // resume lands on the same question. Self-practice exam keeps the legacy
    // random-shuffle behavior.
    const ordered = isAssignmentRun
      ? questions.slice(0, requestedQuestionCount)
      : shuffleArray(questions).slice(0, requestedQuestionCount);
    setSessionQuestions(ordered);

    if (isAssignmentRun && answered) {
      const prefilled: Record<number, AnswerRecord> = {};
      ordered.forEach((q, index) => {
        const prior = answered[q.id];
        if (prior && prior.selectedOptionId) {
          prefilled[index] = {
            selectedOptionId: prior.selectedOptionId,
            isCorrect: prior.isCorrect,
          };
        }
      });
      setAnswers(prefilled);
      const firstUnanswered = ordered.findIndex((q) => {
        const prior = answered[q.id];
        return !prior?.selectedOptionId;
      });
      setCurrentIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
    }

    setIsInitialized(true);
  }, [questions, requestedQuestionCount, isAssignmentRun, answered]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setSupportsHover(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const finishExamOnboarding = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
    }
    setIsNavigatorPinnedOpen(false);
    setExamOnboardingStep(null);
  }, []);

  useEffect(() => {
    if (phase !== "exam") {
      examOnboardingOfferedRef.current = false;
    }
  }, [phase]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (phase !== "exam") return;
    if (!isInitialized) return;
    if (sessionQuestions.length === 0) return;
    if (window.localStorage.getItem(EXAM_ONBOARDING_DISMISSED_KEY) === "1") {
      return;
    }
    if (examOnboardingOfferedRef.current) return;
    examOnboardingOfferedRef.current = true;
    setExamOnboardingStep("intro");
  }, [phase, isInitialized, sessionQuestions.length]);

  useLayoutEffect(() => {
    if (examOnboardingStep !== "navigator") return;
    setIsNavigatorPinnedOpen(true);
  }, [examOnboardingStep]);

  // Session lifecycle. The session is created once the learner actually
  // starts the exam (i.e. leaves the config phase). `markStageCompleted` is
  // called from `confirmSubmit` below so unmount-after-submit is not logged
  // as an abandonment.
  const { sessionId, markStageCompleted } = useAnalyticsSession({
    mode: "exam",
    assignmentId,
    enabled: phase !== "config",
  });

  // Latest session id, read at emit-time by effects whose dependencies must
  // exclude `sessionId` to avoid duplicate emits on id transitions.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (phase !== "review" || reviewIndex === null) return;
    const reviewQuestion = sessionQuestions[reviewIndex];
    if (!reviewQuestion) return;
    trackAnalyticsEvent({
      eventType: "review_item_opened",
      mode: "review",
      questionId: reviewQuestion.id,
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
    });
  }, [assignmentId, phase, reviewIndex, sessionQuestions]);

  // Fire `explanation_opened` once per question when its feedback panel becomes
  // visible during the post-exam review phase. The `answer` gate mirrors the
  // JSX condition that renders FeedbackPanel (only when the student answered).
  const explanationEmittedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (phase !== "review" || reviewIndex === null) return;
    const reviewQuestion = sessionQuestions[reviewIndex];
    if (!reviewQuestion) return;
    const answer = answers[reviewIndex];
    if (!answer?.selectedOptionId) return;
    if (explanationEmittedRef.current.has(reviewQuestion.id)) return;
    explanationEmittedRef.current.add(reviewQuestion.id);
    trackAnalyticsEvent({
      eventType: "explanation_opened",
      mode: "review",
      questionId: reviewQuestion.id,
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
      payload: { phase: "exam_review" },
    });
  }, [answers, assignmentId, phase, reviewIndex, sessionQuestions]);

  const handleReadAloud = useCallback(
    (section: ReadSection) => {
      const activeQuestion =
        phase === "review" && reviewIndex !== null
          ? sessionQuestions[reviewIndex]
          : sessionQuestions[currentIndex];
      if (!activeQuestion) return;
      trackAnalyticsEvent({
        eventType: "tts_played",
        mode: phase === "review" ? "review" : "exam",
        questionId: activeQuestion.id,
        assignmentId,
        sessionId: sessionIdRef.current ?? undefined,
        payload: { target: section },
      });
    },
    [assignmentId, currentIndex, phase, reviewIndex, sessionQuestions],
  );

  // Fire `review_mode_entered` / `review_mode_exited` when the exam's "review"
  // phase (post-submit review of wrong answers) is entered or left. This is
  // separate from the per-item `review_item_opened` events above.
  useEffect(() => {
    if (phase !== "review") return;
    trackAnalyticsEvent({
      eventType: "review_mode_entered",
      mode: "review",
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
    });
    return () => {
      trackAnalyticsEvent({
        eventType: "review_mode_exited",
        mode: "review",
        assignmentId,
        sessionId: sessionIdRef.current ?? undefined,
      });
    };
  }, [assignmentId, phase]);

  const totalQuestions = sessionQuestions.length;
  const answeredCount = Object.values(answers).filter((a) => a.selectedOptionId).length;
  const unansweredCount = totalQuestions - answeredCount;
  const isNavigatorOpen = supportsHover
    ? isNavigatorHovered || isNavigatorPinnedOpen
    : isNavigatorPinnedOpen;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (examOnboardingStep !== "navigator" || !isNavigatorOpen) {
      setIsNavigatorSpotlightReady(false);
      return;
    }
    setIsNavigatorSpotlightReady(false);
    const timeoutId = window.setTimeout(() => {
      setIsNavigatorSpotlightReady(true);
    }, 420);
    return () => window.clearTimeout(timeoutId);
  }, [examOnboardingStep, isNavigatorOpen]);

  useEffect(() => {
    if (phase !== "exam" || examOnboardingStep !== null) return;
    const currentQuestion = sessionQuestions[currentIndex];
    if (!currentQuestion) return;
    trackAnalyticsEvent({
      eventType: "question_viewed",
      mode: "exam",
      questionId: currentQuestion.id,
      assignmentId,
      sessionId: sessionId ?? undefined,
    });
  }, [
    assignmentId,
    currentIndex,
    examOnboardingStep,
    phase,
    sessionQuestions,
    sessionId,
  ]);
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
    
    resetExamDwellTracking();
    setSessionQuestions(selectedQuestions);
    setAnswers({});
    setCurrentIndex(0);
    setPhase("exam");
  }, [questionCount, questions, resetExamDwellTracking]);

  const handleOptionClick = useCallback(
    (optionId: string) => {
      const q = sessionQuestions[currentIndex];
      if (!q) return;
      const isCorrect = optionId === q.correctOptionId;
      flushQuestionVisit();
      const totalDwellMs = questionDwellMsRef.current[currentIndex] ?? 0;
      const timeSpentSec = dwellMsToRecordedSec(totalDwellMs);
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: { ...prev[currentIndex], selectedOptionId: optionId, isCorrect },
      }));

      // For assignment exam runs, persist per-question immediately so
      // closing the tab mid-exam doesn't lose progress. Self-practice exam
      // keeps the legacy batch-on-submit behavior.
      if (isAssignmentRun && assignmentId) {
        const resolvedStandard = q.standardId
          ? { id: q.standardId, label: q.standardLabel }
          : getStandardForTopic(q.topic);
        const student = getStudentById(DEFAULT_STUDENT_ID);
        saveAnswer({
          questionId: q.id,
          selectedOptionId: optionId,
          isCorrect,
          timestamp: Date.now(),
          mode: "exam",
          module: q.module,
          topic: q.topic,
          standardId: resolvedStandard.id,
          standardLabel: resolvedStandard.label,
          assignmentId,
          studentId: student?.id,
          classId: student?.classId,
          teacherId: student?.teacherId,
          ...(timeSpentSec !== null ? { timeSpentSec } : {}),
        });
        assignmentPersistedDwellMsRef.current[currentIndex] = totalDwellMs;
      }

      trackAnalyticsEvent({
        eventType: "attempt_submitted",
        mode: "exam",
        questionId: q.id,
        assignmentId,
        sessionId: sessionId ?? undefined,
        payload: {
          selectedOptionId: optionId,
          isCorrect,
          isAssignmentRun,
        },
      });

      visitRef.current = { index: currentIndex, startMs: nowMs() };
    },
    [
      currentIndex,
      sessionQuestions,
      isAssignmentRun,
      assignmentId,
      sessionId,
      flushQuestionVisit,
    ]
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
    flushQuestionVisit();

    // Assignment runs persist per-question in handleOptionClick to support
    // mid-exam resume, so the batch save would duplicate rows. Skip it here
    // and rely on the completion POST below instead.
    if (!isAssignmentRun) {
      const batch = sessionQuestions.map((q, i) => {
        const a = answers[i];
        const resolvedStandard = q.standardId
          ? { id: q.standardId, label: q.standardLabel }
          : getStandardForTopic(q.topic);
        const totalDwellMs = questionDwellMsRef.current[i] ?? 0;
        const timeSpentSec = dwellMsToRecordedSec(totalDwellMs);
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
          ...(timeSpentSec !== null ? { timeSpentSec } : {}),
          studentId: student?.id,
          classId: student?.classId,
          teacherId: student?.teacherId,
        };
      });
      saveAnswerBatch(batch.filter((b) => b.selectedOptionId));
    }

    if (isAssignmentRun && assignmentId) {
      // Persist any additional dwell collected after the last answer click.
      // This avoids under-reporting when a learner answers once and then
      // spends more time reviewing before submitting.
      sessionQuestions.forEach((q, i) => {
        const a = answers[i];
        if (!a?.selectedOptionId) return;
        // Only questions persisted in this browser session should be eligible
        // for submit-time dwell delta writes. Resumed pre-answered questions
        // have no baseline here; treating them as 0 would create duplicate
        // attempts even when the learner never changed their answer.
        if (
          !Object.prototype.hasOwnProperty.call(
            assignmentPersistedDwellMsRef.current,
            i,
          )
        ) {
          return;
        }
        const totalDwellMs = questionDwellMsRef.current[i] ?? 0;
        const persistedDwellMs = assignmentPersistedDwellMsRef.current[i] ?? 0;
        if (totalDwellMs <= persistedDwellMs) return;
        const resolvedStandard = q.standardId
          ? { id: q.standardId, label: q.standardLabel }
          : getStandardForTopic(q.topic);
        const timeSpentSec = dwellMsToRecordedSec(totalDwellMs);
        saveAnswer({
          questionId: q.id,
          selectedOptionId: a.selectedOptionId,
          isCorrect: a.isCorrect,
          timestamp: nowMs(),
          mode: "exam",
          module: q.module,
          topic: q.topic,
          standardId: resolvedStandard.id,
          standardLabel: resolvedStandard.label,
          assignmentId,
          studentId: student?.id,
          classId: student?.classId,
          teacherId: student?.teacherId,
          ...(timeSpentSec !== null ? { timeSpentSec } : {}),
        });
        assignmentPersistedDwellMsRef.current[i] = totalDwellMs;
      });

      void (async () => {
        try {
          const res = await fetch(
            `/api/assignments/${encodeURIComponent(assignmentId)}/completion`,
            { method: "POST" },
          );
          if (!res.ok) return;
          const body = (await res.json()) as {
            all_assignments_completed?: unknown;
          };
          if (body.all_assignments_completed === true) {
            onAllSchoolAssignmentsCompleted?.();
          }
        } catch {
          // Best-effort; failure leaves the assignment as in_progress.
        }
      })();
    }

    trackAnalyticsEvent({
      eventType: "stage_completed",
      mode: "exam",
      assignmentId,
      sessionId: sessionId ?? undefined,
      payload: {
        answeredCount,
        totalQuestions: sessionQuestions.length,
        elapsedMs,
      },
    });
    markStageCompleted();

    setPhase("results");
  }, [
    answers,
    sessionQuestions,
    flushQuestionVisit,
    isAssignmentRun,
    assignmentId,
    answeredCount,
    elapsedMs,
    markStageCompleted,
    sessionId,
    onAllSchoolAssignmentsCompleted,
  ]);

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
        elapsedMs={elapsedMs}
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
                onPlay={handleReadAloud}
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
                onPlay={handleReadAloud}
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
                    onPlay={handleReadAloud}
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

  return (
    <div className="flex flex-col h-full">
      <PracticeHeader
        topicName={displayTopicName}
        mode="exam"
        modeLabel={modeLabel}
        backHref={backHref}
        showBackLink={false}
        inlineProgress
        compactSpacing
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
        answeredCount={answeredCount}
        rightSlot={
          <>
            <Timer
              isRunning={phase === "exam" && examOnboardingStep === null}
              onElapsedChange={setElapsedMs}
            />
            <button
              onClick={handleSubmit}
              className="px-5 py-2 min-h-[44px] text-sm font-semibold rounded-2xl text-white bg-[#16a34a] hover:bg-[#15803d] shadow-sm hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/60"
            >
              Submit
            </button>
          </>
        }
      />

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
                    onPlay={handleReadAloud}
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
                <AdaptiveDiagramViewport className="mb-4" maxHeightClassName="max-h-[300px]">
                  <DiagramRenderer diagram={question.diagram} />
                </AdaptiveDiagramViewport>
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
                    onPlay={handleReadAloud}
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
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 inline-flex flex-col items-center justify-center gap-1 w-11 h-20 rounded-l-lg border border-r-0 border-[#16a34a]/30 bg-white/95 text-[#166534] shadow-sm hover:bg-[#16a34a]/5 transition-colors"
            aria-label={isNavigatorOpen ? "Hide question navigator" : "Show question navigator"}
            data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_TOGGLE}
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
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 inline-flex items-center gap-1 rounded-l-lg border border-r-0 border-[#16a34a]/30 bg-white/95 px-3 py-3 min-h-[44px] text-[#166534] shadow-sm hover:bg-[#16a34a]/5 transition-colors"
            aria-label={isNavigatorOpen ? "Hide question navigator" : "Show question navigator"}
            data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_TOGGLE}
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
                <div className="p-2" data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_PANEL}>
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-lg border border-slate-gray/20 bg-white text-slate-gray font-medium hover:bg-slate-gray/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </button>

          <button
            onClick={toggleFlag}
            data-tour-id={EXAM_ONBOARDING_TOUR_IDS.FLAG}
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-[13px] font-medium transition-colors ${
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
            data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NEXT_QUESTION}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {examOnboardingStep === "intro" ? (
        <div className="fixed inset-0 z-[76] flex items-center justify-center px-4 py-6">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={finishExamOnboarding}
            role="presentation"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-2xl border border-[#16a34a]/25 bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a]">
              Exam mode
            </p>
            <h2 className="mt-2 text-xl font-bold text-[#14532d]">
              How this session works
            </h2>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              This is exam mode: it feels closer to a real test. You will not see
              hints or whether each answer is correct until you finish, and your
              score appears at the end. Next, we will point out a few controls
              that help you move through the exam.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={finishExamOnboarding}
                className="text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                Skip tips
              </button>
              <button
                type="button"
                onClick={() => setExamOnboardingStep("next")}
                className="rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#15803d]"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}

      {examOnboardingStep === "next" ? (
        <FeatureSpotlight
          targetId={EXAM_ONBOARDING_TOUR_IDS.NEXT_QUESTION}
          title="Move to the next question"
          description="Use Next to go forward anytime. You can still change your answer until you submit the whole exam."
          ctaLabel="Continue"
          onClose={() => setExamOnboardingStep("navigator-toggle")}
        />
      ) : null}

      {examOnboardingStep === "navigator-toggle" ? (
        <FeatureSpotlight
          targetId={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_TOGGLE}
          title="Open the navigator"
          description="Use this edge control to open or close the question navigator."
          ctaLabel="Continue"
          onClose={() => setExamOnboardingStep("navigator")}
        />
      ) : null}

      {examOnboardingStep === "navigator" ? (
        <FeatureSpotlight
          targetId={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_PANEL}
          title="Question navigator"
          description="Use this panel to jump to any question. Tabs help you filter all, unanswered, or flagged items."
          cardOffsetY={88}
          showCard={isNavigatorSpotlightReady}
          ctaLabel="Continue"
          onClose={() => setExamOnboardingStep("flag")}
        />
      ) : null}

      {examOnboardingStep === "flag" ? (
        <FeatureSpotlight
          targetId={EXAM_ONBOARDING_TOUR_IDS.FLAG}
          title="Mark for review"
          description="Flag questions you want to revisit before you submit. Flagged items are easy to spot in the navigator and on your results summary."
          ctaLabel="Got it"
          onClose={finishExamOnboarding}
        />
      ) : null}
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
          style={{ color: scorePercent >= 60 ? PRIMARY_COLOR : "#475569" }}
        >
          {scorePercent}%
        </p>

        <div className="flex justify-center gap-6 mt-4 text-sm">
          <div className="text-center">
            <p className="text-lg font-bold text-slate-gray">{correctCount}</p>
            <p className="text-slate-gray/60">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-gray">
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
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-[#16a34a] text-[#14532d] font-medium hover:bg-[#16a34a]/10 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </motion.div>
  );
}
