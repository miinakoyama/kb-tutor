"use client";

import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Flag,
  Bookmark,
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  PanelRightOpen,
  PanelRightClose,
  Lightbulb,
  Home,
  Send,
} from "lucide-react";
import type { Question, AnswerRecord, QuestionTypeSelection } from "@/types/question";
import { buildMixedQuestionSequence } from "@/lib/question-type-sequence";
import type { GradedFeedback, PartLabel, ShortAnswerItem } from "@/types/short-answer";
import { StimulusPanel } from "@/components/short-answer/StimulusPanel";
import {
  FeedbackBlock,
  ModelAnswerBlock,
} from "@/components/short-answer/FeedbackBlock";
import { QuestionDisplay } from "@/components/shared/QuestionDisplay";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { ExamNavigator } from "@/components/shared/ExamNavigator";
import { Timer } from "@/components/shared/Timer";
import { getBackLabel } from "@/components/shared/PracticeHeader";
import {
  QuestionSessionShell,
  sessionPrimaryButtonClass,
  sessionPrimaryButtonStyle,
  sessionSecondaryButtonClass,
  sessionSecondaryButtonStyle,
} from "@/components/shared/QuestionSessionShell";
import { fetchBookmarkIds, saveAnswer, saveAnswerBatch, toggleBookmark } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";
import { withShuffledMcqOptions } from "@/lib/mcq-options";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { AdaptiveDiagramViewport } from "@/components/diagrams/AdaptiveDiagramViewport";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useQuestionMedia } from "@/hooks/useQuestionMedia";
import { useShortViewport } from "@/hooks/useShortViewport";
import { buildChoicesReadText, buildFeedbackReadText } from "@/lib/tts-utils";
import { ReadAloudButton } from "@/components/shared/ReadAloudButton";
import { FeatureSpotlight } from "@/components/shared/FeatureSpotlight";
import { getStandardForTopic } from "@/lib/standards";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { useAnalyticsSession } from "@/lib/analytics/session";
import type { ReadSection } from "@/hooks/useTextToSpeech";
import { answeredEntryForQuestion } from "@/lib/assignments/answered-map";
import { checkForNewlyEarnedBadges } from "@/lib/badges/celebration-events";
import { partModelAnswer } from "@/lib/short-answer/grading/common";

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
  /** When "mixed", questions are ordered 3 MCQ : 1 SAQ (self-practice runs only). */
  questionTypeSelection?: QuestionTypeSelection;
  assignmentId?: string;
  /** Where the header back link leads (set by the caller from the entry point). */
  backHref?: string;
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
  gradingStatus?: "graded" | "skipped" | "failed";
}

interface SaqGradingProgress {
  completed: number;
  total: number;
}

function isSaqQuestion(
  q: Question | undefined,
): q is Question & { shortAnswer: ShortAnswerItem } {
  return q?.questionType === "open-ended" && Boolean(q?.shortAnswer);
}

function countGradableSaqParts(
  questions: Question[],
  responses: Record<number, Partial<Record<PartLabel, string>>>,
): number {
  return questions.reduce((total, question, index) => {
    if (!isSaqQuestion(question)) return total;
    const questionResponses = responses[index] ?? {};
    return (
      total +
      question.shortAnswer.parts.filter(
        (part) => (questionResponses[part.label] ?? "").trim().length > 0,
      ).length
    );
  }, 0);
}

function examQuestionPreviewText(q: Question): string {
  return isSaqQuestion(q) ? q.shortAnswer.stem : q.text;
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
  questionTypeSelection,
  assignmentId,
  backHref = "/self-practice",
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
  const [bookmarkedQuestionIds, setBookmarkedQuestionIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>({});
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [isNavigatorPinnedOpen, setIsNavigatorPinnedOpen] = useState(false);
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
  const [saqGradingProgress, setSaqGradingProgress] =
    useState<SaqGradingProgress>({ completed: 0, total: 0 });
  const [examOnboardingStep, setExamOnboardingStep] =
    useState<ExamOnboardingStep | null>(null);
  const [isNavigatorSpotlightReady, setIsNavigatorSpotlightReady] =
    useState(false);
  const examOnboardingOfferedRef = useRef(false);
  /** Cumulative time (ms) the learner had each question visible during the exam phase (multiple visits add up). */
  const questionDwellMsRef = useRef<Record<number, number>>({});
  const assignmentFinalAttemptIdsRef = useRef<Record<number, string>>({});
  const visitRef = useRef<{ index: number; startMs: number } | null>(null);
  const blurFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const examRunStartedAtRef = useRef(new Date().toISOString());

  const { question: hydratedCurrentQuestion, isMediaPending } =
    useQuestionMedia(sessionQuestions[currentIndex] ?? null);
  const { question: hydratedReviewQuestion, isMediaPending: isReviewMediaPending } =
    useQuestionMedia(
      reviewIndex !== null ? (sessionQuestions[reviewIndex] ?? null) : null,
    );

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
    assignmentFinalAttemptIdsRef.current = {};
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
    } else if (questionTypeSelection === "mixed") {
      ordered = buildMixedQuestionSequence(questions, requestedQuestionCount);
    } else {
      let pool = shuffleArray(questions);
      while (pool.length < requestedQuestionCount) {
        pool = [...pool, ...shuffleArray(questions)];
      }
      ordered = pool.slice(0, requestedQuestionCount);
    }
    examRunStartedAtRef.current = new Date().toISOString();
    setSessionQuestions(withShuffledMcqOptions(ordered));

    if (isAssignmentRun && answered) {
      const prefilled: Record<number, AnswerRecord> = {};
      ordered.forEach((q, index) => {
        const prior = answeredEntryForQuestion(answered, q);
        if (prior && prior.selectedOptionId) {
          prefilled[index] = {
            selectedOptionId: prior.selectedOptionId,
            isCorrect: prior.isCorrect,
          };
        }
      });
      setAnswers(prefilled);
      const firstUnanswered = ordered.findIndex((q) => {
        const prior = answeredEntryForQuestion(answered, q);
        return !prior?.selectedOptionId;
      });
      setCurrentIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
    }

    setIsInitialized(true);
  }, [questions, requestedQuestionCount, isAssignmentRun, answered, questionTypeSelection]);

  useEffect(() => {
    if (sessionQuestions.length === 0) {
      setBookmarkedQuestionIds(new Set());
      return;
    }
    void fetchBookmarkIds().then((ids) => {
      const bookmarked = new Set(ids);
      setBookmarkedQuestionIds(
        new Set(
          sessionQuestions
            .map((question) => question.id)
            .filter((id) => bookmarked.has(id)),
        ),
      );
    });
  }, [sessionQuestions]);

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

  // Check for newly earned badges once the session reaches its results
  // screen — never mid-session, even though the underlying triggers (KC
  // mastery, session counts, streaks) can be satisfied earlier. The shared
  // checker waits for queued attempts to persist before syncing badges.
  const badgeCelebrationCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "results" || badgeCelebrationCheckedRef.current) return;
    badgeCelebrationCheckedRef.current = true;
    void checkForNewlyEarnedBadges();
  }, [phase]);

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

  const handleBookmarkToggle = useCallback(() => {
    const activeQuestion = sessionQuestions[currentIndex];
    if (!activeQuestion) return;
    const nextBookmarked = toggleBookmark(activeQuestion.id);
    setBookmarkedQuestionIds((prev) => {
      const next = new Set(prev);
      if (nextBookmarked) next.add(activeQuestion.id);
      else next.delete(activeQuestion.id);
      return next;
    });
    trackAnalyticsEvent({
      eventType: nextBookmarked ? "bookmark_added" : "bookmark_removed",
      mode: phase === "review" ? "review" : "exam",
      questionId: activeQuestion.id,
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
    });
  }, [assignmentId, currentIndex, phase, sessionQuestions]);

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
  const isNavigatorOpen = isNavigatorPinnedOpen;
  const assignmentPrimaryButtonStyle = {
    color: "var(--assignment-cta-text)",
    background: "var(--assignment-cta-bg-strong)",
    border: "1.5px solid var(--assignment-cta-border-hover)",
    boxShadow: "var(--assignment-cta-elevated-shadow)",
  };
  const assignmentPrimaryButtonClass =
    "inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] rounded-full font-semibold text-[13px] transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-cta-bg-hover)] active:bg-[var(--assignment-cta-bg-active)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0";

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
      selectedQuestions = withShuffledMcqOptions(
        shuffled.slice(0, questionCount).map((q, idx) => ({
          ...q,
          _sessionIndex: idx,
        })),
      );
    } else {
      const shuffled = shuffleArray(questions);
      let tempQuestions = [...shuffled];
      
      while (tempQuestions.length < questionCount) {
        const reshuffled = shuffleArray(questions);
        const remaining = questionCount - tempQuestions.length;
        tempQuestions = [...tempQuestions, ...reshuffled.slice(0, remaining)];
      }
      
      selectedQuestions = withShuffledMcqOptions(
        tempQuestions.map((q, idx) => ({
          ...q,
          _sessionIndex: idx,
        })),
      );
    }
    
    badgeCelebrationCheckedRef.current = false;
    resetExamDwellTracking();
    examRunStartedAtRef.current = new Date().toISOString();
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
        saveAnswer({
          questionId: q.id,
          questionSetId: q.questionSetId,
          questionContentVersion: q.contentVersion,
          isFinalized: false,
          selectedOptionId: optionId,
          isCorrect,
          timestamp: Date.now(),
          mode: "exam",
          module: q.module,
          topic: q.topic,
          standardId: resolvedStandard.id,
          standardLabel: resolvedStandard.label,
          assignmentId,
          ...(timeSpentSec !== null ? { timeSpentSec } : {}),
        });
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
  const gradeShortAnswerQuestions = useCallback(async (
    onPartCompleted?: (completed: number) => void,
  ): Promise<Record<number, boolean>> => {
    const resultUpdates: Record<
      number,
      Partial<Record<PartLabel, SaqPartResult>>
    > = {};
    const correctness: Record<number, boolean> = {};
    let completedParts = 0;

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
        if (text.trim().length === 0) {
          partResults[part.label] = {
            score: 0,
            maxScore: part.maxScore,
            correct: false,
            feedback: null,
            gradingStatus: "skipped",
          };
          allCorrect = false;
          continue;
        }
        let partResult: SaqPartResult = {
          score: 0,
          maxScore: part.maxScore,
          correct: false,
          feedback: null,
          gradingStatus: "failed",
        };
        try {
          const res = await fetch("/api/short-answer/grade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId: q.id,
              questionSetId: q.questionSetId ?? null,
              assignmentId: assignmentId ?? null,
              sessionId: assignmentId ? null : sessionIdRef.current,
              practiceRunAfter: assignmentId
                ? null
                : examRunStartedAtRef.current,
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
            partResult = {
              score: data.score,
              maxScore: data.maxScore,
              correct: data.correct,
              feedback: {
                ...data.feedback,
                modelAnswer:
                  data.feedback.modelAnswer?.trim() ||
                  partModelAnswer(q.shortAnswer, part),
              },
              gradingStatus: "graded",
            };
          }
        } catch {
          // Keep the incorrect fallback so one failed request cannot block submit.
        }
        partResults[part.label] = partResult;
        if (!partResult.correct) allCorrect = false;
        completedParts += 1;
        onPartCompleted?.(completedParts);
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
    if (isMediaPending) return;
    setPhase("confirm");
  }, [isMediaPending]);

  const confirmSubmit = useCallback(async () => {
    if (isMediaPending) return;
    flushQuestionVisit();

    // Grade deferred short-answer parts before showing results. The grade
    // route persists both detailed and summary rows server-side.
    const totalSaqParts = countGradableSaqParts(
      sessionQuestions,
      saqResponses,
    );
    setSaqGradingProgress({ completed: 0, total: totalSaqParts });
    if (totalSaqParts > 0) setIsGradingSaq(true);
    try {
      await gradeShortAnswerQuestions((completed) => {
        setSaqGradingProgress({ completed, total: totalSaqParts });
      });
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
            questionSetId: q.questionSetId,
            questionContentVersion: q.contentVersion,
            selectedOptionId: a?.selectedOptionId ?? "",
            isCorrect: a?.isCorrect ?? false,
            timestamp: Date.now(),
            mode: "exam" as const,
            module: q.module,
            topic: q.topic,
            standardId: resolvedStandard.id,
            standardLabel: resolvedStandard.label,
            ...(timeSpentSec !== null ? { timeSpentSec } : {}),
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
      // Draft option clicks support resume but are not BKT evidence. Submit
      // exactly one finalized attempt per answered MCQ, including resumed
      // drafts whose dwell time did not change in this browser session.
      sessionQuestions.forEach((q, i) => {
        if (isSaqQuestion(q)) return;
        const a = answers[i];
        if (!a?.selectedOptionId) return;
        const totalDwellMs = questionDwellMsRef.current[i] ?? 0;
        const resolvedStandard = q.standardId
          ? { id: q.standardId, label: q.standardLabel }
          : getStandardForTopic(q.topic);
        const timeSpentSec = dwellMsToRecordedSec(totalDwellMs);
        const clientAttemptId =
          assignmentFinalAttemptIdsRef.current[i] ?? crypto.randomUUID();
        assignmentFinalAttemptIdsRef.current[i] = clientAttemptId;
        saveAnswer({
          clientAttemptId,
          questionId: q.id,
          questionSetId: q.questionSetId,
          questionContentVersion: q.contentVersion,
          isFinalized: true,
          selectedOptionId: a.selectedOptionId,
          isCorrect: a.isCorrect,
          timestamp: nowMs(),
          mode: "exam",
          module: q.module,
          topic: q.topic,
          standardId: resolvedStandard.id,
          standardLabel: resolvedStandard.label,
          assignmentId,
          ...(timeSpentSec !== null ? { timeSpentSec } : {}),
        });
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
    saqResponses,
    flushQuestionVisit,
    gradeShortAnswerQuestions,
    isAssignmentRun,
    assignmentId,
    answeredCount,
    elapsedMs,
    markStageCompleted,
    sessionId,
    onAllSchoolAssignmentsCompleted,
    isMediaPending,
  ]);

  if (phase === "config") {
    return (
      <div className="h-full overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ExamConfig
          questionCount={questionCount}
          setQuestionCount={setQuestionCount}
          onStart={startExam}
          topicName={topicName}
          backHref={backHref}
        />
      </div>
    );
  }

  if (phase === "results") {
    const correctCount = Object.values(answers).filter((a) => a.isCorrect).length;
    return (
      <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <ExamResults
          questions={sessionQuestions}
          answers={answers}
          saqResults={saqResults}
          correctCount={correctCount}
          elapsedMs={elapsedMs}
          topicName={topicName}
          onReview={(index) => {
            setReviewIndex(index);
            setPhase("review");
          }}
          onRetry={() => {
            badgeCelebrationCheckedRef.current = false;
            resetExamDwellTracking();
            setElapsedMs(0);
            setAnswers({});
            setSaqResponses({});
            setSaqResults({});
            examRunStartedAtRef.current = new Date().toISOString();
            setCurrentIndex(0);
            setReviewIndex(null);
            setIsNavigatorPinnedOpen(false);
            setPhase("exam");
          }}
        />
      </div>
    );
  }

  if (phase === "review" && reviewIndex !== null) {
    const q = hydratedReviewQuestion ?? sessionQuestions[reviewIndex];
    const a = answers[reviewIndex];
    if (isSaqQuestion(q)) {
      return (
        <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-4 pb-8 pt-4 sm:px-6 sm:pt-5 lg:px-8">
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
                  imageLoading={isReviewMediaPending}
                />
              </div>
              <div className="flex flex-col gap-4">
              {q.shortAnswer.parts.map((part) => {
                const result = saqResults[reviewIndex]?.[part.label];
                const text = saqResponses[reviewIndex]?.[part.label] ?? "";
                const modelAnswer =
                  result?.feedback?.modelAnswer?.trim() ||
                  partModelAnswer(q.shortAnswer, part);
                return (
                  <div
                    key={part.label}
                    className="rounded-xl border border-border-default bg-surface p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Part {part.label}
                      </p>
                      {result && result.gradingStatus !== "skipped" ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            result.correct
                              ? "bg-emerald-100 text-emerald-800"
                              : result.gradingStatus === "failed"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {result.gradingStatus === "failed"
                            ? "Could not grade"
                            : result.correct
                              ? "Correct"
                              : "Incorrect"}{" "}
                          · {result.score}/{result.maxScore}
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
                    {result?.feedback &&
                      (result.feedback.segments.length > 0 ||
                        Boolean(result.feedback.modelAnswer)) && (
                        <FeedbackBlock feedback={result.feedback} triesLeft={0} />
                      )}
                    {!result?.feedback && (
                      <ModelAnswerBlock modelAnswer={modelAnswer} />
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
    const reviewQuestionAndChoicesReadText = `${q.text} ${reviewChoicesText}`.trim();
    const reviewFeedbackText = buildFeedbackReadText(q, a, {
      includeKeyKnowledge: true,
      includeMisconception: true,
    });
    return (
      <div className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-4 pb-8 pt-4 sm:px-6 sm:pt-5 lg:px-8">
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
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">Question {reviewIndex + 1}</p>
            {isSupported ? (
              <ReadAloudButton
                section="question"
                label="Question and choices"
                text={reviewQuestionAndChoicesReadText}
                isSpeaking={isSpeaking}
                currentSection={currentSection}
                onToggle={toggleSpeak}
                onPlay={handleReadAloud}
                iconOnly
              />
            ) : null}
          </div>
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
              isQuestionReading ? "bg-primary/10 px-3 py-2" : ""
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
          </div>
          {hasSubmittedAnswer ? (
            <FeedbackPanel
              question={q}
              answer={a}
              showKeyKnowledge
              showMisconception
              feedbackReadText={reviewFeedbackText}
              onReadAloud={handleReadAloud}
            />
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
        <div className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] p-8 text-center max-w-md">
          <p className="text-slate-gray mb-4">
            No questions are available for this selection yet. Please select different standards or check back later.
          </p>
          <Link
            href={backHref}
            className={assignmentPrimaryButtonClass}
            style={assignmentPrimaryButtonStyle}
          >
            {getBackLabel(backHref)}
          </Link>
        </div>
      </div>
    );
  }

  const question = hydratedCurrentQuestion ?? sessionQuestions[currentIndex];
  const currentAnswer = answers[currentIndex];

  if (!question) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-gray">No questions available for this selection.</div>
      </div>
    );
  }

  const unansweredLabel = Math.max(0, unansweredCount);
  const isCurrentQuestionBookmarked = bookmarkedQuestionIds.has(question.id);
  const examFooterCenter = (
    <button
      onClick={handleBookmarkToggle}
      aria-pressed={isCurrentQuestionBookmarked}
      className={sessionSecondaryButtonClass}
      style={sessionSecondaryButtonStyle}
    >
      <Bookmark
        className={`w-4 h-4 ${isCurrentQuestionBookmarked ? "fill-current" : ""}`}
      />
      <span className="hidden sm:inline">
        {isCurrentQuestionBookmarked ? "Bookmarked" : "Bookmark"}
      </span>
    </button>
  );

  const isCurrentQuestionFlagged = Boolean(answers[currentIndex]?.flagged);
  const examFlagButton = (
    <button
      type="button"
      onClick={toggleFlag}
      data-tour-id={EXAM_ONBOARDING_TOUR_IDS.FLAG}
      aria-pressed={isCurrentQuestionFlagged}
      aria-label={isCurrentQuestionFlagged ? "Unmark for review" : "Mark for review"}
      title={isCurrentQuestionFlagged ? "Unmark for review" : "Mark for review"}
      className={`inline-flex items-center justify-center h-8 w-8 rounded-full p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        isCurrentQuestionFlagged
          ? ""
          : "bg-[var(--assignment-calendar-nav-bg)] text-slate-gray hover:bg-[var(--assignment-calendar-nav-bg-hover)]"
      }`}
      style={{
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-nav-shadow)",
        backdropFilter: "blur(10px) saturate(130%)",
        WebkitBackdropFilter: "blur(10px) saturate(130%)",
        ...(isCurrentQuestionFlagged
          ? { background: "var(--assignment-mode-review-bg)", color: "var(--assignment-mode-review)" }
          : undefined),
      }}
    >
      <Flag
        className="w-3.5 h-3.5"
        style={isCurrentQuestionFlagged ? { fill: "var(--assignment-mode-review)" } : undefined}
      />
    </button>
  );

  const isLastQuestion = currentIndex === totalQuestions - 1;
  const hasAnsweredCurrentQuestion = Boolean(currentAnswer?.selectedOptionId);
  const examNextAction = isLastQuestion ? (
    <button
      onClick={handleSubmit}
      disabled={!hasAnsweredCurrentQuestion || isMediaPending}
      className={sessionPrimaryButtonClass}
      style={sessionPrimaryButtonStyle}
    >
      Submit
      <Send className="w-4 h-4" />
    </button>
  ) : (
    <button
      onClick={() => setCurrentIndex((i) => i + 1)}
      data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NEXT_QUESTION}
      className={sessionPrimaryButtonClass}
      style={sessionPrimaryButtonStyle}
    >
      Next
      <ChevronRight className="w-4 h-4" />
    </button>
  );

  return (
    <>
      <QuestionSessionShell
        backHref={backHref}
        showBackLink={false}
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
        hideProgress
        variant={isSaqQuestion(question) ? "split" : "mcq"}
        mediaHeavy={Boolean(question.imageUrl || question.diagram)}
        onPrevious={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        previousDisabled={currentIndex === 0}
        headerRight={
          <>
            <Timer
              isRunning={phase === "exam" && !isExamTimingPausedByOnboarding}
              onElapsedChange={setElapsedMs}
            />
            <button
              onClick={handleSubmit}
              disabled={isMediaPending}
              className={assignmentPrimaryButtonClass}
              style={assignmentPrimaryButtonStyle}
            >
              Submit
            </button>
            <button
              type="button"
              onClick={() => setIsNavigatorPinnedOpen((prev) => !prev)}
              data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_TOGGLE}
              aria-expanded={isNavigatorOpen}
              aria-label={
                isNavigatorOpen
                  ? "Hide question navigator"
                  : "Show question navigator"
              }
              className="relative inline-flex items-center justify-center w-11 h-11 min-h-[44px] rounded-full bg-[var(--assignment-row-cta-bg)] transition duration-200 hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              style={sessionSecondaryButtonStyle}
            >
              {isNavigatorOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
              {unansweredLabel > 0 && (
                <span
                  className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-semibold"
                  style={{
                    background: "var(--assignment-cta-bg-strong)",
                    color: "var(--assignment-cta-text)",
                  }}
                >
                  {unansweredLabel}
                </span>
              )}
            </button>
          </>
        }
        footerCenter={examFooterCenter}
        primaryAction={examNextAction}
      >
        {isSaqQuestion(question) ? (
          <ExamShortAnswerCard
            key={question.id}
            questionNumber={currentIndex + 1}
            stimulusImageLoading={isMediaPending}
            item={question.shortAnswer}
            responses={saqResponses[currentIndex] ?? {}}
            onChange={(label, value) =>
              handleSaqResponseChange(currentIndex, label, value)
            }
            headerAction={examFlagButton}
          />
        ) : (
          <QuestionDisplay
            key={question.id}
            question={question}
            questionNumber={currentIndex + 1}
            currentAnswer={undefined}
            selectedOptionId={currentAnswer?.selectedOptionId ?? null}
            pendingSelection
            revealCorrectAnswer={false}
            onOptionClick={handleOptionClick}
            onReadAloud={handleReadAloud}
            headerAction={examFlagButton}
          />
        )}
      </QuestionSessionShell>

      <AnimatePresence>
        {isNavigatorOpen && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNavigatorPinnedOpen(false)}
              className="fixed inset-0 z-30 bg-black/10"
              aria-label="Close question navigator overlay"
            />
            <motion.aside
              initial={{ x: 380, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 380, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="fixed right-0 top-16 bottom-0 z-40 w-[22rem] max-w-[92vw]"
            >
              <div className="p-2" data-tour-id={EXAM_ONBOARDING_TOUR_IDS.NAVIGATOR_PANEL}>
                <ExamNavigator
                  totalQuestions={totalQuestions}
                  currentIndex={currentIndex}
                  answers={answers}
                  onNavigate={(index) => {
                    setCurrentIndex(index);
                    setIsNavigatorPinnedOpen(false);
                  }}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

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

      {isGradingSaq && saqGradingProgress.total > 0 ? (
        <GradingProgressDialog progress={saqGradingProgress} />
      ) : null}
    </>
  );
}

function GradingProgressDialog({
  progress,
}: {
  progress: SaqGradingProgress;
}) {
  const percent = Math.round((progress.completed / progress.total) * 100);
  const progressText = `${progress.completed} of ${progress.total} written ${
    progress.total === 1 ? "response" : "responses"
  } complete`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-grading-title"
        aria-describedby="exam-grading-description"
        className="w-full max-w-sm rounded-2xl px-6 py-6 text-center sm:px-8"
        style={{
          background: "var(--assignment-glass-bg-strong)",
          border: "1px solid var(--assignment-glass-border)",
          boxShadow: "var(--assignment-card-shadow)",
          backdropFilter: "blur(14px) saturate(115%)",
          WebkitBackdropFilter: "blur(14px) saturate(115%)",
        }}
      >
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <h2
          id="exam-grading-title"
          className="mt-3 text-base font-semibold text-slate-gray"
        >
          Grading your written answers…
        </h2>
        <div className="mt-5 flex items-center justify-between gap-4 text-sm">
          <p className="font-medium text-slate-gray" aria-live="polite">
            {progressText}
          </p>
          <span className="tabular-nums text-muted-foreground" aria-hidden="true">
            {percent}%
          </span>
        </div>
        <div
          className="mt-2 h-3 overflow-hidden rounded-full border"
          style={{
            background: "var(--surface-muted)",
            borderColor: "var(--border-default)",
            boxShadow: "var(--assignment-pill-highlight)",
          }}
          role="progressbar"
          aria-label="Written-answer grading progress"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
          aria-valuetext={progressText}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: "var(--assignment-progress-fill)" }}
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p
          id="exam-grading-description"
          className="mt-3 text-xs text-muted-foreground"
        >
          This can take a few seconds per response.
        </p>
      </div>
    </div>
  );
}

/**
 * Exam-mode short-answer view. Mirrors the practice-mode split workspace
 * (`ShortAnswerQuestionView`) — one glass surface, part-progress subheader,
 * 44/52 stimulus | response grid with a hairline divider, and PartCard-style
 * input cards — but in exam form: every part is open at once, there is no
 * per-part Check/feedback, and grading is deferred until the exam is submitted.
 */
function ExamShortAnswerCard({
  questionNumber,
  item,
  responses,
  onChange,
  stimulusImageLoading = false,
  headerAction,
}: {
  questionNumber: number;
  item: ShortAnswerItem;
  responses: Partial<Record<PartLabel, string>>;
  onChange: (label: PartLabel, value: string) => void;
  /** True while a stripped stimulus image is still being fetched (see useQuestionMedia). */
  stimulusImageLoading?: boolean;
  headerAction?: ReactNode;
}) {
  const isFilled = (label: PartLabel) =>
    (responses[label] ?? "").trim().length > 0;

  // Compact the workspace on short viewports so the whole question fits
  // without scrolling (mirrors ShortAnswerQuestionView).
  const isShortViewport = useShortViewport();
  const columnPaddingClass = isShortViewport
    ? "p-4 sm:p-5 lg:p-6"
    : "p-5 sm:p-8 lg:p-10";

  return (
    <motion.div
      // Opacity-only fade: an x/y transform on this ancestor would become the
      // containing block for the sticky stimulus panel below and break its
      // scroll-stick behavior, so we deliberately avoid transforms here.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-busy={stimulusImageLoading}
      className="rounded-[24px] border"
      style={{
        background: "var(--assignment-glass-bg-strong)",
        borderColor: "var(--assignment-glass-border)",
        boxShadow: "var(--assignment-card-shadow)",
      }}
    >
      <div
        className={`flex ${isShortViewport ? "h-[52px]" : "h-[68px]"} items-center justify-between gap-3 border-b px-5 sm:px-8 lg:px-10`}
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Question {questionNumber}
          </p>
          {headerAction}
        </div>
        <div
          className="flex items-center gap-1"
          aria-label="Progress across parts"
        >
          {item.parts.map((part, i) => {
            const answered = isFilled(part.label);
            return (
              <div key={part.label} className="flex items-center">
                {i > 0 && (
                  <div
                    className="h-0.5 w-6"
                    style={{
                      background: isFilled(item.parts[i - 1].label)
                        ? "var(--assignment-completed-muted)"
                        : "var(--border-default)",
                    }}
                  />
                )}
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors"
                  style={
                    answered
                      ? {
                          background: "var(--assignment-completed-muted)",
                          color: "var(--assignment-on-accent)",
                        }
                      : {
                          background: "var(--assignment-row-cta-bg)",
                          color: "var(--muted-foreground)",
                        }
                  }
                >
                  {part.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,44fr)_1px_minmax(0,52fr)]">
        <div className={columnPaddingClass}>
          <div className={`lg:sticky ${isShortViewport ? "lg:top-3" : "lg:top-6"}`}>
            <StimulusPanel
              stem={item.stem}
              stimulus={item.stimulus}
              framed={false}
              imageLoading={stimulusImageLoading}
            />
          </div>
        </div>

        <div
          aria-hidden
          className="h-px mx-5 sm:mx-8 lg:mx-0 lg:h-auto lg:w-px"
          style={{ background: "var(--border-subtle)" }}
        />

        <div className={`flex flex-col gap-3 ${columnPaddingClass}`}>
          {item.parts.map((part) => {
            const value = responses[part.label] ?? "";
            return (
              <section
                key={part.label}
                aria-label={`Part ${part.label}`}
                className="rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] p-4 backdrop-blur-md sm:p-5"
                style={{ boxShadow: "var(--assignment-card-shadow)" }}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/55">
                  Part {part.label}
                </span>
                <p className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed text-[color:var(--foreground)]">
                  {part.prompt}
                </p>
                <div className="mt-3">
                  <textarea
                    value={value}
                    onChange={(e) => {
                      if (!stimulusImageLoading) {
                        onChange(part.label, e.target.value);
                      }
                    }}
                    disabled={stimulusImageLoading}
                    maxLength={part.maxLength}
                    rows={3}
                    placeholder="Type your answer…"
                    aria-label={`Answer for Part ${part.label}`}
                    className="w-full resize-none rounded-xl border border-[color:var(--assignment-panel-border)] bg-white/70 px-3 py-2 text-[15px] text-[color:var(--foreground)] focus:border-[var(--assignment-completed)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div className="mt-1 flex items-center justify-end">
                    <span className="text-[11px] text-[color:var(--foreground)]/40">
                      {value.length}/{part.maxLength}
                    </span>
                  </div>
                </div>
              </section>
            );
          })}
          <p className="text-[12px] text-muted-foreground">
            Your answers are graded after you submit the exam.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function ExamConfig({
  questionCount,
  setQuestionCount,
  onStart,
  topicName,
  backHref,
}: {
  questionCount: number;
  setQuestionCount: (n: number) => void;
  onStart: () => void;
  topicName?: string;
  backHref: string;
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
          href={backHref}
          className="inline-flex items-center gap-2 text-base font-semibold text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--assignment-calendar-nav-bg)]">
            <ArrowLeft className="w-4 h-4" />
          </span>
          {getBackLabel(backHref)}
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
  const assignmentPrimaryButtonStyle = {
    color: "var(--assignment-cta-text)",
    background: "var(--assignment-cta-bg-strong)",
    border: "1.5px solid var(--assignment-cta-border-hover)",
    boxShadow: "var(--assignment-cta-elevated-shadow)",
    fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
  };
  const assignmentSecondaryButtonStyle = {
    color: "var(--assignment-row-cta-text)",
    background: "var(--assignment-row-cta-bg)",
    border: "1.5px solid var(--assignment-row-cta-border)",
    boxShadow: "var(--assignment-row-cta-shadow)",
    fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-[92vw] max-w-lg rounded-2xl p-7 sm:p-8"
        style={{
          background: "var(--assignment-glass-bg)",
          border: "1px solid var(--assignment-glass-border)",
          boxShadow: "var(--assignment-card-shadow)",
          backdropFilter: "blur(14px) saturate(115%)",
          WebkitBackdropFilter: "blur(14px) saturate(115%)",
        }}
      >
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface/40 hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="mb-2 text-center text-xl font-bold text-slate-gray">
          Submit Exam?
        </h3>

        {unansweredCount > 0 && (
          <div className="mb-2 flex items-center justify-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p>
              You have {unansweredCount} unanswered{" "}
              {unansweredCount === 1 ? "question" : "questions"}.
            </p>
          </div>
        )}

        <p className="mb-5 text-center text-sm text-muted-foreground">
          Once submitted, you cannot change your answers. Are you sure?
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)]"
            style={assignmentSecondaryButtonStyle}
          >
            Go Back
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-cta-bg-hover)] active:bg-[var(--assignment-cta-bg-active)]"
            style={assignmentPrimaryButtonStyle}
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
  saqResults,
  correctCount,
  elapsedMs,
  topicName,
  onReview,
  onRetry,
}: {
  questions: Question[];
  answers: Record<number, AnswerRecord>;
  saqResults: Record<number, Partial<Record<PartLabel, SaqPartResult>>>;
  correctCount: number;
  elapsedMs: number;
  topicName?: string;
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
  const assignmentPrimaryButtonStyle = {
    color: "var(--assignment-cta-text)",
    background: "var(--assignment-cta-bg-strong)",
    border: "1.5px solid var(--assignment-cta-border-hover)",
    boxShadow: "var(--assignment-cta-elevated-shadow)",
  };
  const assignmentSecondaryButtonStyle = {
    color: "var(--assignment-row-cta-text)",
    background: "var(--assignment-row-cta-bg)",
    border: "1.5px solid var(--assignment-row-cta-border)",
    boxShadow: "var(--assignment-row-cta-shadow)",
  };
  const assignmentPrimaryButtonClass =
    "inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full font-semibold text-[13px] transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-cta-bg-hover)] active:bg-[var(--assignment-cta-bg-active)]";
  const assignmentSecondaryButtonClass =
    "inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full font-semibold text-[13px] transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)]";

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
            const isShortAnswer = answer?.selectedOptionId === "short-answer";
            const isCorrect = isShortAnswer
              ? Boolean(answer?.isCorrect)
              : answer?.selectedOptionId === q.correctOptionId;
            const isFlagged = answer?.flagged;
            const saqPartResults = isShortAnswer && isSaqQuestion(q)
              ? q.shortAnswer.parts.map(
                  (part) => saqResults[index]?.[part.label],
                )
              : null;
            const saqCorrectParts = saqPartResults
              ? saqPartResults.filter((r) => r?.correct).length
              : 0;
            const saqTotalParts = saqPartResults?.length ?? 0;
            return (
              <button
                key={index}
                onClick={() => onReview(index)}
                className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-foreground/5 ${
                  !hasSubmittedAnswer
                    ? "border-border-default"
                    : isCorrect
                      ? "border-primary/20"
                      : saqPartResults && saqCorrectParts > 0
                        ? "border-amber-300"
                        : "border-error-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-medium text-muted-foreground mt-0.5 w-5">
                    {position + 1}
                  </span>
                  <p className="flex-1 text-sm text-slate-gray line-clamp-1">
                    {examQuestionPreviewText(q)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isFlagged && (
                      <Flag className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    )}
                    {!hasSubmittedAnswer ? null : saqPartResults ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={
                          isCorrect
                            ? { color: PRIMARY_COLOR, background: "color-mix(in srgb, var(--primary) 12%, transparent)" }
                            : saqCorrectParts > 0
                              ? { color: "#b45309", background: "rgba(180, 83, 9, 0.12)" }
                              : { color: "#dc2626", background: "rgba(220, 38, 38, 0.12)" }
                        }
                      >
                        {saqCorrectParts}/{saqTotalParts}
                      </span>
                    ) : isCorrect ? (
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

      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={onRetry}
            className={assignmentSecondaryButtonClass}
            style={assignmentSecondaryButtonStyle}
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>
          <Link
            href="/"
            className={assignmentPrimaryButtonClass}
            style={assignmentPrimaryButtonStyle}
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
