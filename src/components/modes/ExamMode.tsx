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
  Lightbulb,
} from "lucide-react";
import type { Question, AnswerRecord } from "@/types/question";
import type { GradedFeedback, PartLabel, ShortAnswerItem } from "@/types/short-answer";
import { StimulusPanel } from "@/components/short-answer/StimulusPanel";
import { FeedbackBlock } from "@/components/short-answer/FeedbackBlock";
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
import { badgeAmber, calloutAmber, calloutAmberIcon } from "@/lib/ui/status-badge-styles";
import { buildChoicesReadText, buildFeedbackReadText } from "@/lib/tts-utils";
import { ReadAloudButton } from "@/components/shared/ReadAloudButton";
import { FeatureSpotlight } from "@/components/shared/FeatureSpotlight";
import { getStandardForTopic } from "@/lib/standards";
import { DEFAULT_STUDENT_ID, getStudentById } from "@/lib/mock-data";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { useAnalyticsSession } from "@/lib/analytics/session";
import { NextSessionCTA } from "@/components/shared/NextSessionCTA";
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
  /** Assignment retry boundary (= last_completed_at for the current run). */
  assignmentRunAfter?: string | null;
  /** Fires when the completion API reports every school assignment is done. */
  onAllSchoolAssignmentsCompleted?: () => void;
}

type ExamPhase = "config" | "exam" | "confirm" | "results" | "review";

interface SaqPartResult {
  score: number;
  maxScore: number;
  correct: boolean;
  feedback: GradedFeedback | null;
}

function isSaqQuestion(
  q: Question | undefined,
): q is Question & { shortAnswer: ShortAnswerItem } {
  return q?.questionType === "open-ended" && Boolean(q?.shortAnswer);
}

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

function isExamOnboardingDismissedLocally(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(EXAM_ONBOARDING_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
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
  /** Short-answer responses held locally per question index until submit. */
  const [saqResponses, setSaqResponses] = useState<
    Record<number, Partial<Record<PartLabel, string>>>
  >({});
  /** Per-part grading results, filled at exam submit. */
  const [saqResults, setSaqResults] = useState<
    Record<number, Partial<Record<PartLabel, SaqPartResult>>>
  >({});
  const [isGradingSaq, setIsGradingSaq] = useState(false);
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

  const isExamTimingPausedByOnboarding =
    phase === "exam" &&
    isInitialized &&
    sessionQuestions.length > 0 &&
    !isExamOnboardingDismissedLocally();

  useEffect(() => {
    if (phase !== "exam" || isExamTimingPausedByOnboarding) return;
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
    isExamTimingPausedByOnboarding,
    phase,
    flushQuestionVisit,
  ]);

  useEffect(() => {
    if (phase !== "exam" || isExamTimingPausedByOnboarding) return;
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
    isExamTimingPausedByOnboarding,
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
    // random-shuffle behavior, repeating questions if the bank is smaller
    // than the requested count.
    let ordered: Question[];
    if (isAssignmentRun) {
      ordered = questions.slice(0, requestedQuestionCount);
    } else {
      let pool = shuffleArray(questions);
      while (pool.length < requestedQuestionCount) {
        pool = [...pool, ...shuffleArray(questions)];
      }
      ordered = pool.slice(0, requestedQuestionCount);
    }
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
      try {
        window.localStorage.setItem(EXAM_ONBOARDING_DISMISSED_KEY, "1");
      } catch {
        // Storage can throw (private mode, blocked storage, quota). Dismissal
        // must still work without persisting the flag.
      }
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
    if (phase !== "exam" || isExamTimingPausedByOnboarding) return;
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
    isExamTimingPausedByOnboarding,
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

  const handleSaqResponseChange = useCallback(
    (index: number, label: PartLabel, value: string) => {
      const q = sessionQuestions[index];
      if (!isSaqQuestion(q)) return;
      setSaqResponses((prev) => {
        const next = { ...(prev[index] ?? {}), [label]: value };
        const allFilled = q.shortAnswer.parts.every(
          (part) => (next[part.label] ?? "").trim().length > 0,
        );
        setAnswers((prevAnswers) => ({
          ...prevAnswers,
          [index]: {
            ...prevAnswers[index],
            selectedOptionId: allFilled ? "short-answer" : "",
            isCorrect: false,
          },
        }));
        return { ...prev, [index]: next };
      });
    },
    [sessionQuestions],
  );

  /**
   * Exam deferral (FR-037): grade every touched short-answer part in one pass
   * at submit time (mode 'exam', single attempt). Grading failures never block
   * submission — the part is counted incorrect with no feedback.
   */
  const gradeShortAnswerQuestions = useCallback(async (): Promise<
    Record<number, boolean>
  > => {
    const resultUpdates: Record<
      number,
      Partial<Record<PartLabel, SaqPartResult>>
    > = {};
    const correctness: Record<number, boolean> = {};

    for (let i = 0; i < sessionQuestions.length; i++) {
      const q = sessionQuestions[i];
      if (!isSaqQuestion(q)) continue;
      const responses = saqResponses[i] ?? {};
      const touched = q.shortAnswer.parts.some(
        (part) => (responses[part.label] ?? "").trim().length > 0,
      );
      if (!touched) continue;

      const partResults: Partial<Record<PartLabel, SaqPartResult>> = {};
      let allCorrect = true;
      for (const part of q.shortAnswer.parts) {
        const text = responses[part.label] ?? "";
        try {
          const res = await fetch("/api/short-answer/grade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId: q.id,
              questionSetId: q.questionSetId ?? null,
              assignmentId: assignmentId ?? null,
              partLabel: part.label,
              studentResponse: text,
              attemptNumber: 1,
              mode: "exam",
              clientAttemptId: crypto.randomUUID(),
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              score: number;
              maxScore: number;
              correct: boolean;
              feedback: GradedFeedback;
            };
            partResults[part.label] = {
              score: data.score,
              maxScore: data.maxScore,
              correct: data.correct,
              feedback: data.feedback,
            };
            if (!data.correct) allCorrect = false;
            continue;
          }
        } catch {
          // fall through to the incorrect fallback below
        }
        partResults[part.label] = {
          score: 0,
          maxScore: part.maxScore,
          correct: false,
          feedback: null,
        };
        allCorrect = false;
      }
      resultUpdates[i] = partResults;
      correctness[i] = allCorrect;
    }

    setSaqResults((prev) => ({ ...prev, ...resultUpdates }));
    setAnswers((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(correctness)) {
        const i = Number(key);
        next[i] = {
          ...next[i],
          selectedOptionId: "short-answer",
          isCorrect: correctness[i],
        };
      }
      return next;
    });
    return correctness;
  }, [assignmentId, saqResponses, sessionQuestions]);

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

  const confirmSubmit = useCallback(async () => {
    const student = getStudentById(DEFAULT_STUDENT_ID);
    flushQuestionVisit();

    // Grade deferred short-answer parts before showing results. The grade
    // route persists both detailed and summary rows server-side.
    setIsGradingSaq(true);
    try {
      await gradeShortAnswerQuestions();
    } finally {
      setIsGradingSaq(false);
    }

    // Assignment runs persist per-question in handleOptionClick to support
    // mid-exam resume, so the batch save would duplicate rows. Skip it here
    // and rely on the completion POST below instead. Short-answer questions
    // are excluded: the grade route already wrote their attempt rows.
    if (!isAssignmentRun) {
      const batch = sessionQuestions.map((q, i) => {
        const a = answers[i];
        const resolvedStandard = q.standardId
          ? { id: q.standardId, label: q.standardLabel }
          : getStandardForTopic(q.topic);
        const totalDwellMs = questionDwellMsRef.current[i] ?? 0;
        const timeSpentSec = dwellMsToRecordedSec(totalDwellMs);
        return {
          isSaq: isSaqQuestion(q),
          record: {
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
          },
        };
      });
      saveAnswerBatch(
        batch
          .filter((b) => !b.isSaq && b.record.selectedOptionId)
          .map((b) => b.record),
      );
    }

    if (isAssignmentRun && assignmentId) {
      // Persist any additional dwell collected after the last answer click.
      // This avoids under-reporting when a learner answers once and then
      // spends more time reviewing before submitting.
      sessionQuestions.forEach((q, i) => {
        if (isSaqQuestion(q)) return;
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
    gradeShortAnswerQuestions,
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

  if (phase === "results") {
    const correctCount = Object.values(answers).filter((a) => a.isCorrect).length;
    return (
      <ExamResults
        questions={sessionQuestions}
        answers={answers}
        correctCount={correctCount}
        elapsedMs={elapsedMs}
        topicName={topicName}
        assignmentId={assignmentId}
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
    if (isSaqQuestion(q)) {
      return (
        <div className="w-full">
          <button
            onClick={() => setPhase("results")}
            className="inline-flex items-center gap-2 text-sm font-semibold text-heading hover:text-forest transition-colors mb-4"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <ArrowLeft className="w-4 h-4 text-heading" />
            </span>
            Back to Results
          </button>
          <div className="rounded-xl border border-primary/30 bg-surface p-4 sm:p-6 shadow-sm">
            <p className="text-sm text-muted-foreground mb-3">
              Question {reviewIndex + 1}
            </p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div className="lg:sticky lg:top-4 lg:self-start">
                <StimulusPanel
                  stem={q.shortAnswer.stem}
                  stimulus={q.shortAnswer.stimulus}
                  showHighlightHint={false}
                />
              </div>
              <div className="flex flex-col gap-4">
              {q.shortAnswer.parts.map((part) => {
                const result = saqResults[reviewIndex]?.[part.label];
                const text = saqResponses[reviewIndex]?.[part.label] ?? "";
                return (
                  <div
                    key={part.label}
                    className="rounded-xl border border-border-default bg-surface p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Part {part.label}
                      </p>
                      {result ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            result.correct
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {result.correct ? "Correct" : "Incorrect"} ·{" "}
                          {result.score}/{result.maxScore}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          Not answered
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[15px] leading-relaxed text-slate-gray">
                      {part.prompt}
                    </p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      You wrote
                    </p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm italic text-slate-gray">
                      {text.trim().length > 0 ? `“${text}”` : "(no answer)"}
                    </p>
                    {result?.feedback && (
                      <FeedbackBlock
                        feedback={result.feedback}
                        triesLeft={0}
                        isFinalAttempt
                      />
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </div>
      );
    }
    const hasSubmittedAnswer = Boolean(a?.selectedOptionId);
    const reviewChoicesText = buildChoicesReadText(q);
    const reviewFeedbackText = buildFeedbackReadText(q, a, {
      includeKeyKnowledge: true,
      includeMisconception: true,
    });
    return (
      <div className="w-full">
        <button
          onClick={() => setPhase("results")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-heading hover:text-forest transition-colors mb-4"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <ArrowLeft className="w-4 h-4 text-heading" />
          </span>
          Back to Results
        </button>
        <div className="rounded-xl border border-primary/30 bg-surface p-4 sm:p-6 shadow-sm">
          <p className="text-sm text-muted-foreground mb-3">Question {reviewIndex + 1}</p>
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
            className={`text-base font-medium text-slate-gray leading-relaxed mb-4 whitespace-pre-wrap rounded-lg transition-colors ${
              isQuestionReading ? "bg-primary/10 px-3 py-2" : ""
            }`}
          >
            {q.text}
          </p>
          {q.diagram && (
            <AdaptiveDiagramViewport className="mb-5">
              <DiagramRenderer diagram={q.diagram} />
            </AdaptiveDiagramViewport>
          )}
          <div
            className={`rounded-lg transition-colors mt-4 ${
              isChoicesReading ? "bg-primary/10 px-3 py-2" : ""
            }`}
          >
            <div className="space-y-2.5">
              {q.options.map((opt) => {
                const isSelected = a?.selectedOptionId === opt.id;
                const isCorrect = opt.id === q.correctOptionId;
                const wrongSelection = isSelected && !isCorrect;
                return (
                  <div
                    key={opt.id}
                    className={`rounded-lg border px-3 py-2.5 text-sm flex items-start gap-2 ${
                      isCorrect
                        ? "border-primary/40 bg-primary/5"
                        : wrongSelection
                          ? "border-error-border bg-error-light"
                          : "border-border-default bg-surface"
                    }`}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      ) : wrongSelection ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <span className="inline-block w-4 h-4" />
                      )}
                    </div>
                    <p className="text-slate-gray whitespace-pre-wrap flex-1 min-w-0">
                      {opt.text}
                    </p>
                  </div>
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
          {hasSubmittedAnswer ? (
            <>
              {isSupported && reviewFeedbackText && (
                <div
                  className={`mt-4 mb-2 rounded-lg transition-colors ${
                    isFeedbackReading ? "bg-primary/10 px-3 py-2" : ""
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
          ) : (
            <div className="mt-5 space-y-3">
              <div className="p-4 rounded-xl border border-border-default bg-surface-muted">
                <p className="text-sm font-semibold text-slate-gray mb-1">
                  No answer submitted
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This question was left unanswered. It is counted as incorrect,
                  and the correct option is highlighted above for review.
                </p>
              </div>
              {q.keyKnowledge && (
                <div className="p-3 rounded-xl border border-primary/20 bg-surface-muted">
                  <div className="flex items-start gap-2.5">
                    <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
                        Key Idea
                      </p>
                      <p className="text-sm text-slate-gray leading-relaxed">
                        {q.keyKnowledge}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
        <div className="rounded-xl border border-primary/30 bg-surface p-8 text-center max-w-md">
          <p className="text-slate-gray mb-4">
            No questions are available for this selection yet. Please select different standards or check back later.
          </p>
          <Link
            href="/self-practice"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg text-white font-medium transition-colors bg-primary hover:bg-primary-hover"
          >
            Back to Self Practice
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

  const unansweredLabel = Math.max(0, unansweredCount);

  return (
    <div className="flex flex-col h-full">
      <PracticeHeader
        topicName={topicName}
        mode="exam"
        modeLabel="Mock Exam"
        backHref="/self-practice"
        showBackLink={false}
        inlineProgress
        compactSpacing
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
        answeredCount={answeredCount}
        rightSlot={
          <>
            <Timer
              isRunning={phase === "exam" && !isExamTimingPausedByOnboarding}
              onElapsedChange={setElapsedMs}
            />
            <button
              onClick={handleSubmit}
              className="px-5 py-2 min-h-[44px] text-sm font-semibold rounded-2xl text-white bg-primary hover:bg-primary-hover shadow-sm hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
              className="rounded-xl border border-primary/30 bg-surface p-4 sm:p-5 shadow-sm"
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
              {isSaqQuestion(question) ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                  <div className="lg:sticky lg:top-4 lg:self-start">
                    <StimulusPanel
                      stem={question.shortAnswer.stem}
                      stimulus={question.shortAnswer.stimulus}
                      showHighlightHint={false}
                    />
                  </div>
                  <div className="flex flex-col gap-4">
                  {question.shortAnswer.parts.map((part) => {
                    const value =
                      saqResponses[currentIndex]?.[part.label] ?? "";
                    return (
                      <div
                        key={part.label}
                        className="rounded-xl border border-border-default bg-surface p-4"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Part {part.label}
                        </p>
                        <p className="mt-1 text-[15px] leading-relaxed text-slate-gray">
                          {part.prompt}
                        </p>
                        <textarea
                          value={value}
                          onChange={(e) =>
                            handleSaqResponseChange(
                              currentIndex,
                              part.label,
                              e.target.value,
                            )
                          }
                          maxLength={part.maxLength}
                          rows={3}
                          placeholder="Type your answer…"
                          aria-label={`Answer for Part ${part.label}`}
                          className="mt-2 w-full resize-none rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-slate-gray focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <p className="mt-1 text-right text-[11px] text-muted-foreground">
                          {value.length}/{part.maxLength}
                        </p>
                      </div>
                    );
                  })}
                  <p className="text-[12px] text-muted-foreground">
                    Your answers are graded after you submit the exam.
                  </p>
                  </div>
                </div>
              ) : (
                <>
              <p
                className={`text-[15px] font-medium text-slate-gray leading-relaxed mb-3 whitespace-pre-wrap rounded-lg transition-colors ${
                  isQuestionReading ? "bg-primary/10 px-3 py-2" : ""
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
                  isChoicesReading ? "bg-primary/10 px-3 py-2" : ""
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
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {supportsHover ? (
          <button
            onMouseEnter={() => setIsNavigatorHovered(true)}
            onMouseLeave={() => setIsNavigatorHovered(false)}
            onClick={() => setIsNavigatorPinnedOpen((prev) => !prev)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 inline-flex flex-col items-center justify-center gap-1 w-11 h-20 rounded-l-lg border border-r-0 border-primary/30 bg-surface/95 text-forest shadow-sm hover:bg-primary/5 transition-colors"
            aria-label={isNavigatorOpen ? "Hide question navigator" : "Show question navigator"}
            data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_TOGGLE}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${isNavigatorOpen ? "translate-x-0.5" : ""}`} />
            {unansweredLabel > 0 && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-primary/10 text-forest text-[10px] font-semibold px-1">
                {unansweredLabel}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => setIsNavigatorPinnedOpen((prev) => !prev)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 inline-flex items-center gap-1 rounded-l-lg border border-r-0 border-primary/30 bg-surface/95 px-3 py-3 min-h-[44px] text-forest shadow-sm hover:bg-primary/5 transition-colors"
            aria-label={isNavigatorOpen ? "Hide question navigator" : "Show question navigator"}
            data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_TOGGLE}
          >
            {isNavigatorOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
            {unansweredLabel > 0 && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-primary/10 text-forest text-[10px] font-semibold px-1">
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
        <div className="flex items-center justify-between bg-surface-muted rounded-xl p-2.5 border border-primary/20">
          <button
            onClick={() => currentIndex > 0 && setCurrentIndex((i) => i - 1)}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-lg border border-border-default bg-surface text-slate-gray font-medium hover:bg-foreground/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </button>

          <button
            onClick={toggleFlag}
            data-tour-id={EXAM_ONBOARDING_TOUR_IDS.FLAG}
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-[13px] font-medium transition-colors ${
              answers[currentIndex]?.flagged
                ? badgeAmber
                : "text-muted-foreground hover:text-muted-foreground border border-border-subtle hover:border-border-default"
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-lg text-white font-medium bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
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
            className="relative w-full max-w-md rounded-2xl border border-primary/25 bg-surface p-6 shadow-2xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Exam mode
            </p>
            <h2 className="mt-2 text-xl font-bold text-heading">
              How this session works
            </h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              This is exam mode: it feels closer to a real test. You will not see
              hints or whether each answer is correct until you finish, and your
              score appears at the end. Next, we will point out a few controls
              that help you move through the exam.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={finishExamOnboarding}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Skip tips
              </button>
              <button
                type="button"
                onClick={() => setExamOnboardingStep("next")}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
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

      {phase === "confirm" ? (
        <ConfirmDialog
          unansweredCount={unansweredCount}
          onConfirm={() => void confirmSubmit()}
          onCancel={() => setPhase("exam")}
        />
      ) : null}

      {isGradingSaq ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="rounded-2xl bg-surface px-8 py-6 text-center shadow-2xl">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-sm font-semibold text-slate-gray">
              Grading your written answers…
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              This can take a few seconds per part.
            </p>
          </div>
        </div>
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
          className="inline-flex items-center gap-2 text-base font-semibold text-heading hover:text-forest transition-colors mb-4"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <ArrowLeft className="w-4 h-4 text-heading" />
          </span>
          Back to Home
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold font-heading text-heading">
          {isFullExam ? "Mock Exam" : topicName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
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
              className={`w-full text-left p-5 rounded-3xl border bg-surface shadow-sm transition-all ${
                isActive
                  ? "border-primary shadow-md"
                  : "border-primary/30 hover:border-primary hover:shadow-md"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold text-slate-gray">
                    {opt.label}
                  </span>
                  <p className="text-xs text-primary font-medium">
                    {opt.count} questions
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  {opt.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={onStart}
        className="w-full py-3 rounded-2xl text-white font-semibold bg-primary hover:bg-primary-hover transition-colors shadow-sm"
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
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-surface rounded-xl border border-primary/30 shadow-xl p-6 max-w-sm w-[90vw]"
      >
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-lg font-bold text-slate-gray mb-2">
          Submit Exam?
        </h3>

        {unansweredCount > 0 && (
          <div className={`flex items-start gap-2 p-3 mb-4 ${calloutAmber}`}>
            <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${calloutAmberIcon}`} />
            <p className="text-sm text-slate-gray">
              You have {unansweredCount} unanswered{" "}
              {unansweredCount === 1 ? "question" : "questions"}.
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-5">
          Once submitted, you cannot change your answers. Are you sure?
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-border-default text-slate-gray font-medium hover:bg-foreground/5 transition-colors text-sm"
          >
            Go Back
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-white font-medium bg-primary hover:bg-primary-hover transition-colors text-sm"
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
  elapsedMs,
  topicName,
  assignmentId,
  onReview,
  onRetry,
}: {
  questions: Question[];
  answers: Record<number, AnswerRecord>;
  correctCount: number;
  elapsedMs: number;
  topicName?: string;
  /**
   * Optional — when this results screen is shown after finishing an
   * assignment, pass it so the "Next" CTA can exclude that assignment
   * from its suggestion candidates.
   */
  assignmentId?: string;
  onReview: (index: number) => void;
  onRetry: () => void;
}) {
  const reviewEntries = questions.map((q, index) => ({
    q,
    index,
    answer: answers[index],
  }));
  const total = questions.length;
  const answeredTotal = reviewEntries.filter(
    ({ answer }) => !!answer?.selectedOptionId,
  ).length;
  const unansweredTotal = total - answeredTotal;
  const incorrectTotal = total - correctCount;
  const scorePercent =
    total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const minutes = Math.floor(elapsedMs / 60000);
  const avgSeconds = total > 0 ? Math.round(elapsedMs / 1000 / total) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-4 pb-8"
    >
      <div className="rounded-xl border border-primary/30 bg-surface p-6 shadow-sm text-center">
        {topicName && (
          <p className="text-sm text-muted-foreground mb-2">{topicName}</p>
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
            <p className="text-muted-foreground">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-gray">
              {incorrectTotal}
            </p>
            <p className="text-muted-foreground">Incorrect</p>
          </div>
          {unansweredTotal > 0 && (
            <div className="text-center">
              <p className="text-lg font-bold text-slate-gray">
                {unansweredTotal}
              </p>
              <p className="text-muted-foreground">Unanswered</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-lg font-bold text-slate-gray">{minutes}m</p>
            <p className="text-muted-foreground">Total time</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-gray">{avgSeconds}s</p>
            <p className="text-muted-foreground">Avg / question</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-primary/30 bg-surface p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-gray mb-3">
          Review Questions
        </h3>
        <div className="space-y-2">
          {reviewEntries.map(({ q, index, answer }, position) => {
            const hasSubmittedAnswer = Boolean(answer?.selectedOptionId);
            const isCorrect = answer?.selectedOptionId === q.correctOptionId;
            const isFlagged = answer?.flagged;
            return (
              <button
                key={index}
                onClick={() => onReview(index)}
                className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-foreground/5 ${
                  !hasSubmittedAnswer
                    ? "border-border-default"
                    : isCorrect
                      ? "border-primary/20"
                      : "border-error-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-medium text-muted-foreground mt-0.5 w-5">
                    {position + 1}
                  </span>
                  <p className="flex-1 text-sm text-slate-gray line-clamp-1">
                    {q.text}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isFlagged && (
                      <Flag className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    )}
                    {!hasSubmittedAnswer ? null : isCorrect ? (
                      <CheckCircle2
                        className="w-4 h-4"
                        style={{ color: PRIMARY_COLOR }}
                      />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/*
        Same action hierarchy as the Practice / Review summary:
          1. NextSessionCTA owns the primary filled-green styling and points
             at the most urgent unfinished assignment, or Self Practice when
             everything is done. This is what we want students to actually
             do next.
          2. Try Again ('redo this exam') and Back to Home ('stop') are
             demoted to outlined / muted styles so they don't fight the
             forward path for attention.
      */}
      <div className="flex flex-col items-center gap-3">
        <NextSessionCTA excludeAssignmentId={assignmentId} />
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/30 text-heading font-medium hover:bg-primary/5 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-border-default text-slate-gray font-medium hover:bg-foreground/5 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
