"use client";

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
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
  BookOpen,
  X,
} from "lucide-react";
import type { AnswerRecord, ConfidenceLevel, GlossaryTerm, Question } from "@/types/question";
import { QuestionDisplay } from "@/components/shared/QuestionDisplay";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { ConfidenceCheck } from "@/components/shared/ConfidenceCheck";
import { GlossaryPopover } from "@/components/shared/GlossaryPopover";
import { PracticeHeader } from "@/components/shared/PracticeHeader";
import { FeatureSpotlight } from "@/components/shared/FeatureSpotlight";
import { buildFeedbackReadText } from "@/lib/tts-utils";
import { fetchBookmarkIds, saveAnswer, toggleBookmark } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";
import { getStandardForTopic } from "@/lib/standards";
import { DEFAULT_STUDENT_ID, getStudentById } from "@/lib/mock-data";
import glossaryData from "@/data/glossary.json";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { useAnalyticsSession } from "@/lib/analytics/session";
import type { ReadSection } from "@/hooks/useTextToSpeech";

const DEFAULT_QUESTION_COUNT = 10;
const MAX_ATTEMPTS = 3;
const GLOSSARY_FALLBACK_LIMIT = 6;
const READ_ALOUD_SPOTLIGHT_DISMISSED_KEY =
  "kb-tutor-spotlight-read-aloud-dismissed-v1";
const SIDEBAR_GLOSSARY_SPOTLIGHT_DISMISSED_KEY =
  "kb-tutor-spotlight-sidebar-glossary-dismissed-v1";
const INLINE_GLOSSARY_SPOTLIGHT_DISMISSED_KEY =
  "kb-tutor-spotlight-inline-glossary-dismissed-v1";
const FEATURE_SPOTLIGHT_TARGET_IDS = {
  READ_ALOUD: "feature-read-aloud",
  SIDEBAR_GLOSSARY_BUTTON: "feature-sidebar-glossary-button",
  INLINE_GLOSSARY_TERM: "feature-inline-glossary-term",
} as const;

type FeatureSpotlightType = "read-aloud" | "sidebar-glossary" | "inline-glossary";

interface AdaptivePracticeModeProps {
  questions: Question[];
  topicName?: string;
  questionCount?: number;
  assignmentId?: string;
  mode?: "practice" | "review";
  backHref?: string;
  showBackLink?: boolean;
  /**
   * Pre-answered questions for the current run, keyed by question id. When
   * provided (assignment mode), the component:
   *   - trusts the incoming question order (no client-side reshuffle)
   *   - pre-fills finalAnswers and jumps to the first unanswered question
   *   - POSTs completion when all questions are finalized
   */
  answered?: Record<
    string,
    { selectedOptionId: string | null; isCorrect: boolean; answeredAt: string }
  >;
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
  mode = "practice",
  backHref = "/self-practice",
  showBackLink = false,
  answered,
}: AdaptivePracticeModeProps) {
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [attemptsByIndex, setAttemptsByIndex] = useState<Record<number, AttemptRecord[]>>({});
  const [retryReadyByIndex, setRetryReadyByIndex] = useState<Record<number, boolean>>({});
  const [finalAnswers, setFinalAnswers] = useState<Record<number, AnswerRecord>>({});
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<Set<string>>(new Set());
  const [questionStartMs, setQuestionStartMs] = useState<number>(() => Date.now());
  const [showSummary, setShowSummary] = useState(false);
  const [isGlossaryModalOpen, setIsGlossaryModalOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [completionReported, setCompletionReported] = useState(false);
  const [activeFeatureSpotlight, setActiveFeatureSpotlight] =
    useState<FeatureSpotlightType | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const isAssignmentRun = Boolean(assignmentId) && answered !== undefined;

  const { sessionId, markStageCompleted } = useAnalyticsSession({
    mode,
    assignmentId,
  });

  // Latest session id, read at emit-time by effects whose dependencies must
  // exclude `sessionId` to avoid re-entry / duplicate emits.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // When mode === "review", emit the mode-level entry/exit events in addition
  // to the per-item `review_item_*` events that already fire below. Runs once
  // on mount and once on unmount per review session.
  useEffect(() => {
    if (mode !== "review") return;
    trackAnalyticsEvent({
      eventType: "review_mode_entered",
      mode,
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
    });
    return () => {
      trackAnalyticsEvent({
        eventType: "review_mode_exited",
        mode,
        assignmentId,
        sessionId: sessionIdRef.current ?? undefined,
      });
    };
  }, [mode, assignmentId]);

  useEffect(() => {
    // For assignments we trust the server's deterministic ordering so resume
    // always lands on the same question. Self-practice keeps the legacy
    // random-shuffle-and-cap behavior.
    const selected = isAssignmentRun
      ? questions.slice(0, questionCount)
      : shuffleArray(questions).slice(0, questionCount);
    setSessionQuestions(selected);
    // Seed bookmark state from Supabase so it stays correct across devices.
    // toggleBookmark updates the localStorage cache synchronously after this
    // point, so the UI stays responsive without more DB round-trips.
    void fetchBookmarkIds().then((ids) => {
      const bookmarked = new Set(ids);
      setBookmarkedQuestions(
        new Set(selected.map((q) => q.id).filter((id) => bookmarked.has(id))),
      );
    });

    if (isAssignmentRun && answered) {
      const prefilledFinals: Record<number, AnswerRecord> = {};
      const prefilledAttempts: Record<number, AttemptRecord[]> = {};
      selected.forEach((q, index) => {
        const prior = answered[q.id];
        if (!prior) return;
        prefilledFinals[index] = {
          selectedOptionId: prior.selectedOptionId ?? "",
          isCorrect: prior.isCorrect,
        };
        if (prior.selectedOptionId) {
          prefilledAttempts[index] = [
            {
              selectedOptionId: prior.selectedOptionId,
              isCorrect: prior.isCorrect,
            },
          ];
        }
      });
      setFinalAnswers(prefilledFinals);
      setAttemptsByIndex(prefilledAttempts);
      const firstUnanswered = selected.findIndex((q) => !answered[q.id]);
      setCurrentIndex(firstUnanswered === -1 ? selected.length - 1 : firstUnanswered);
    }

    setIsInitialized(true);
  }, [questions, questionCount, isAssignmentRun, answered]);

  useEffect(() => {
    setSelectedOptionId(null);
    setQuestionStartMs(Date.now());
  }, [currentIndex]);

  useEffect(() => {
    // When the student reaches the summary screen after finishing every
    // question in an assignment session, tell the server so the assignment is
    // marked Completed on the student's list.
    if (!isAssignmentRun || !assignmentId || !showSummary || completionReported) {
      return;
    }
    setCompletionReported(true);
    void fetch(
      `/api/assignments/${encodeURIComponent(assignmentId)}/completion`,
      { method: "POST" },
    ).catch(() => {
      // Best-effort; failure leaves the assignment as in_progress until next run.
    });
  }, [assignmentId, showSummary, isAssignmentRun, completionReported]);

  const question = sessionQuestions[currentIndex];
  const attempts = useMemo(
    () => attemptsByIndex[currentIndex] ?? [],
    [attemptsByIndex, currentIndex]
  );
  const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : undefined;
  const isCorrect = !!lastAttempt?.isCorrect;
  const isCompleted = isCorrect || attempts.length >= MAX_ATTEMPTS;
  const isRetryReady = retryReadyByIndex[currentIndex] ?? attempts.length === 0;
  const isAwaitingRetry = !isCompleted && attempts.length > 0 && !isRetryReady;
  const showScaffold = attempts.length >= 1 && !isCorrect;
  const canTryAgain = isAwaitingRetry;
  const finalAnswer = finalAnswers[currentIndex];
  const totalQuestions = sessionQuestions.length;
  const completedCount = Object.keys(finalAnswers).length;
  const allCompleted = completedCount === totalQuestions && totalQuestions > 0;

  useEffect(() => {
    if (!question) return;
    trackAnalyticsEvent({
      eventType: mode === "review" ? "review_item_opened" : "question_viewed",
      mode,
      questionId: question.id,
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
    });
  }, [assignmentId, mode, question]);

  // `hint_opened` fires whenever the scaffold transitions to visible; the
  // paired `hint_closed` fires when the scaffold disappears (correct answer,
  // max attempts reached, or the learner moves to the next question). Dwell
  // time on the scaffold is `hint_closed.occurred_at - hint_opened.occurred_at`.
  const hintOpenStartRef = useRef<number | null>(null);
  const hintQuestionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!question) return;
    if (showScaffold) {
      hintOpenStartRef.current = Date.now();
      hintQuestionIdRef.current = question.id;
      trackAnalyticsEvent({
        eventType: "hint_opened",
        mode,
        questionId: question.id,
        assignmentId,
        sessionId: sessionIdRef.current ?? undefined,
        payload: { attemptCount: attempts.length },
      });
      return;
    }
    if (hintOpenStartRef.current !== null) {
      const openMs = Date.now() - hintOpenStartRef.current;
      trackAnalyticsEvent({
        eventType: "hint_closed",
        mode,
        questionId: hintQuestionIdRef.current ?? question.id,
        assignmentId,
        sessionId: sessionIdRef.current ?? undefined,
        payload: { openMs },
      });
      hintOpenStartRef.current = null;
      hintQuestionIdRef.current = null;
    }
  }, [assignmentId, attempts.length, mode, question, showScaffold]);

  const glossaryTerms = useMemo(() => {
    if (!question || !showScaffold) return [];
    const allTerms = [...(question.inlineTerms ?? []), ...(question.sidebarTerms ?? [])];
    const seen = new Set<string>();
    const deduped = allTerms.filter((term) => {
      if (seen.has(term.id)) return false;
      seen.add(term.id);
      return true;
    });
    if (deduped.length > 0) return deduped;

    // Fallback for legacy questions that do not include inlineTerms/sidebarTerms.
    const searchableText =
      `${question.text} ${question.options.map((option) => option.text).join(" ")}`.toLowerCase();
    const matched = (glossaryData as GlossaryTerm[]).filter((term) => {
      const escaped = term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      return regex.test(searchableText);
    });
    return matched.slice(0, GLOSSARY_FALLBACK_LIMIT);
  }, [question, showScaffold]);

  const inlineTermMap = useMemo(() => {
    const map = new Map<string, GlossaryTerm>();
    if (!showScaffold) return map;
    for (const term of question?.inlineTerms ?? []) {
      map.set(term.term.toLowerCase(), term);
    }
    return map;
  }, [question, showScaffold]);

  const hasInlineGlossaryHighlights = useMemo(() => {
    if (!question || !showScaffold || inlineTermMap.size === 0) return false;
    const searchableText = `${question.text} ${question.options
      .map((option) => option.text)
      .join(" ")}`;

    for (const termLabel of inlineTermMap.keys()) {
      const escaped = termLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      if (regex.test(searchableText)) return true;
    }

    return false;
  }, [inlineTermMap, question, showScaffold]);

  useEffect(() => {
    if (typeof window === "undefined" || activeFeatureSpotlight) return;

    const hasSidebarGlossaryTarget = Boolean(
      document.querySelector(
        `[data-tour-id="${FEATURE_SPOTLIGHT_TARGET_IDS.SIDEBAR_GLOSSARY_BUTTON}"]`,
      ),
    );
    const hasInlineGlossaryTarget = Boolean(
      document.querySelector(
        `[data-tour-id="${FEATURE_SPOTLIGHT_TARGET_IDS.INLINE_GLOSSARY_TERM}"]`,
      ),
    );

    const sidebarGlossaryReady =
      showScaffold &&
      attempts.length > 0 &&
      isRetryReady &&
      glossaryTerms.length > 0;
    const inlineGlossaryReady =
      showScaffold &&
      attempts.length > 0 &&
      isRetryReady &&
      hasInlineGlossaryHighlights;

    if (
      window.speechSynthesis &&
      // Keep this eligible even if target lookup is momentarily delayed.
      window.localStorage.getItem(READ_ALOUD_SPOTLIGHT_DISMISSED_KEY) !== "1"
    ) {
      setActiveFeatureSpotlight("read-aloud");
      return;
    }

    if (
      sidebarGlossaryReady &&
      hasSidebarGlossaryTarget &&
      window.localStorage.getItem(SIDEBAR_GLOSSARY_SPOTLIGHT_DISMISSED_KEY) !==
        "1"
    ) {
      setActiveFeatureSpotlight("sidebar-glossary");
      return;
    }

    if (
      inlineGlossaryReady &&
      hasInlineGlossaryTarget &&
      window.localStorage.getItem(INLINE_GLOSSARY_SPOTLIGHT_DISMISSED_KEY) !==
        "1"
    ) {
      setActiveFeatureSpotlight("inline-glossary");
    }
  }, [
    activeFeatureSpotlight,
    attempts.length,
    glossaryTerms.length,
    hasInlineGlossaryHighlights,
    isRetryReady,
    question?.id,
    showScaffold,
  ]);

  const dismissReadAloudSpotlight = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(READ_ALOUD_SPOTLIGHT_DISMISSED_KEY, "1");
    }
    setActiveFeatureSpotlight((current) =>
      current === "read-aloud" ? null : current,
    );
  }, []);

  const dismissInlineGlossarySpotlight = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        INLINE_GLOSSARY_SPOTLIGHT_DISMISSED_KEY,
        "1",
      );
    }
    setActiveFeatureSpotlight((current) =>
      current === "inline-glossary" ? null : current,
    );
  }, []);

  const dismissSidebarGlossarySpotlight = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SIDEBAR_GLOSSARY_SPOTLIGHT_DISMISSED_KEY,
        "1",
      );
    }
    setActiveFeatureSpotlight((current) =>
      current === "sidebar-glossary" ? null : current,
    );
  }, []);

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
      const firstHighlightedIndex = parts.findIndex((candidate) =>
        inlineTermMap.has(candidate.toLowerCase()),
      );
      return parts.map((part, index) => {
        const term = inlineTermMap.get(part.toLowerCase());
        if (!term) return part;
        const spotlightId =
          index === firstHighlightedIndex
            ? FEATURE_SPOTLIGHT_TARGET_IDS.INLINE_GLOSSARY_TERM
            : undefined;
        return (
          <GlossaryPopover
            key={`${term.id}_${index}`}
            term={term}
            onOpen={(t) => {
              if (!question) return;
              trackAnalyticsEvent({
                eventType: "glossary_term_opened",
                mode,
                questionId: question.id,
                assignmentId,
                sessionId: sessionIdRef.current ?? undefined,
                payload: {
                  termId: t.id,
                  termLabel: t.term,
                  source: "inline",
                  scaffoldShown: showScaffold,
                },
              });
            }}
          >
            <span data-tour-id={spotlightId}>{part}</span>
          </GlossaryPopover>
        );
      });
    },
    [assignmentId, inlineTermMap, mode, question, showScaffold],
  );

  const submitAttempt = useCallback(() => {
    if (!question || !selectedOptionId || isCompleted || !isRetryReady) return;
    const result: AttemptRecord = {
      selectedOptionId,
      isCorrect: selectedOptionId === question.correctOptionId,
    };
    const nextAttempts = [...attempts, result];
    const elapsedSec = Math.max(5, Math.round((Date.now() - questionStartMs) / 1000));

    setAttemptsByIndex((prev) => ({ ...prev, [currentIndex]: nextAttempts }));
    setSelectedOptionId(null);
    setRetryReadyByIndex((prev) => ({ ...prev, [currentIndex]: false }));
    setQuestionStartMs(Date.now());

    const shouldFinalize = result.isCorrect || nextAttempts.length >= MAX_ATTEMPTS;
    if (shouldFinalize) {
      const finalRecord: AnswerRecord = {
        // Keep the learner's final choice so UI can show wrong (red) + correct (green)
        // when max attempts are reached on an incorrect answer.
        selectedOptionId: result.selectedOptionId,
        isCorrect: result.isCorrect,
      };
      setFinalAnswers((prev) => ({ ...prev, [currentIndex]: finalRecord }));
    }

    const resolvedStandard = question.standardId
      ? { id: question.standardId, label: question.standardLabel }
      : getStandardForTopic(question.topic);
    const student = getStudentById(DEFAULT_STUDENT_ID);
    saveAnswer({
      questionId: question.id,
      selectedOptionId: selectedOptionId,
      isCorrect: result.isCorrect,
      timestamp: Date.now(),
      mode,
      module: question.module,
      topic: question.topic,
      standardId: resolvedStandard.id,
      standardLabel: resolvedStandard.label,
      timeSpentSec: elapsedSec,
      assignmentId,
      studentId: student?.id,
      classId: student?.classId,
      teacherId: student?.teacherId,
    });

    trackAnalyticsEvent({
      eventType: "attempt_submitted",
      mode,
      questionId: question.id,
      assignmentId,
      sessionId: sessionId ?? undefined,
      payload: {
        selectedOptionId,
        isCorrect: result.isCorrect,
        attemptIndex: nextAttempts.length,
        elapsedSec,
        showScaffold,
      },
    });
  }, [
    assignmentId,
    attempts,
    currentIndex,
    isCompleted,
    mode,
    question,
    questionStartMs,
    isRetryReady,
    selectedOptionId,
    sessionId,
    showScaffold,
  ]);

  const handleConfidence = useCallback(
    (level: ConfidenceLevel) => {
      if (!finalAnswer) return;
      setFinalAnswers((prev) => ({
        ...prev,
        [currentIndex]: { ...finalAnswer, confidenceLevel: level },
      }));
      if (question) {
        trackAnalyticsEvent({
          eventType: "confidence_submitted",
          mode,
          questionId: question.id,
          assignmentId,
          sessionId: sessionIdRef.current ?? undefined,
          payload: {
            confidenceLevel: level,
            isCorrect: finalAnswer.isCorrect,
          },
        });
      }
    },
    [assignmentId, currentIndex, finalAnswer, mode, question],
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
    trackAnalyticsEvent({
      eventType: nextBookmarked ? "bookmark_added" : "bookmark_removed",
      mode,
      questionId: question.id,
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
    });
  }, [assignmentId, mode, question]);

  const handleGlossaryModalOpen = useCallback(() => {
    if (!question) return;
    trackAnalyticsEvent({
      eventType: "glossary_term_opened",
      mode,
      questionId: question.id,
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
      payload: {
        source: "modal",
        scaffoldShown: showScaffold,
        termCount: glossaryTerms.length,
      },
    });
    setIsGlossaryModalOpen(true);
  }, [assignmentId, glossaryTerms.length, mode, question, showScaffold]);

  const handleReadAloud = useCallback(
    (section: ReadSection) => {
      if (!question) return;
      trackAnalyticsEvent({
        eventType: "tts_played",
        mode,
        questionId: question.id,
        assignmentId,
        sessionId: sessionIdRef.current ?? undefined,
        payload: { target: section },
      });
    },
    [assignmentId, mode, question],
  );

  const explanationEmittedRef = useRef<Set<string>>(new Set());
  const feedbackVisible = attempts.length > 0 && (isCompleted || isAwaitingRetry);
  useEffect(() => {
    if (!question || !feedbackVisible) return;
    const key = `${question.id}:${isCompleted ? "completed" : "retry"}`;
    if (explanationEmittedRef.current.has(key)) return;
    explanationEmittedRef.current.add(key);
    trackAnalyticsEvent({
      eventType: "explanation_opened",
      mode,
      questionId: question.id,
      assignmentId,
      sessionId: sessionIdRef.current ?? undefined,
      payload: { phase: isCompleted ? "completed" : "retry" },
    });
  }, [assignmentId, feedbackVisible, isCompleted, mode, question]);

  const handleNext = useCallback(() => {
    if (!isCompleted) return;
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      });
      return;
    }
    if (allCompleted) {
      trackAnalyticsEvent({
        eventType: mode === "review" ? "review_item_completed" : "stage_completed",
        mode,
        assignmentId,
        sessionId: sessionId ?? undefined,
      });
      markStageCompleted();
      setShowSummary(true);
    }
  }, [
    allCompleted,
    assignmentId,
    currentIndex,
    isCompleted,
    markStageCompleted,
    mode,
    sessionId,
    totalQuestions,
  ]);

  useEffect(() => {
    if (attempts.length === 0) return;
    if (!isAwaitingRetry && !isCompleted) return;
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [attempts.length, isAwaitingRetry, isCompleted, currentIndex]);

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
          <h2 className="text-2xl font-bold text-slate-gray mb-2">
            {mode === "review" ? "Review Complete" : "Session Complete"}
          </h2>
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
              setRetryReadyByIndex({});
              setFinalAnswers({});
              setSelectedOptionId(null);
              setShowSummary(false);
              setCompletionReported(false);
              setQuestionStartMs(Date.now());
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {mode === "review" ? "Review Again" : "Try Again"}
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
    : isAwaitingRetry && lastAttempt
      ? {
          selectedOptionId: lastAttempt.selectedOptionId,
          isCorrect: false,
        }
      : undefined;

  return (
    <div className="flex flex-col h-full">
      <PracticeHeader
        topicName={topicName}
        mode={mode}
        backHref={backHref}
        showBackLink={showBackLink}
        inlineProgress
        compactSpacing
        currentQuestion={currentIndex + 1}
        totalQuestions={totalQuestions}
        answeredCount={completedCount}
      />

      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 pb-2">
            <QuestionDisplay
              question={question}
              questionNumber={currentIndex + 1}
              questionMetaText={`Attempt ${Math.max(
                1,
                Math.min(
                  MAX_ATTEMPTS,
                  isCompleted
                    ? attempts.length
                    : isRetryReady
                      ? attempts.length + 1
                      : attempts.length,
                ),
              )}/${MAX_ATTEMPTS}`}
              headerAction={
                glossaryTerms.length > 0 ? (
                  <div
                    className="relative"
                    data-tour-id={FEATURE_SPOTLIGHT_TARGET_IDS.SIDEBAR_GLOSSARY_BUTTON}
                  >
                    <button
                      onClick={handleGlossaryModalOpen}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#16a34a]/30 text-[#166534] bg-white hover:bg-[#16a34a]/5 transition-colors text-xs font-medium"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Glossary
                    </button>
                  </div>
                ) : undefined
              }
              currentAnswer={displayAnswer}
              selectedOptionId={selectedOptionId}
              pendingSelection={!isCompleted && isRetryReady && selectedOptionId !== null}
              revealCorrectAnswer={isCompleted}
              compactLayout
              onOptionClick={(optionId) => {
                if (isCompleted || !isRetryReady) return;
                setSelectedOptionId(optionId);
              }}
              renderQuestionText={renderQuestionText}
              showOptionFeedbackIcons={isCompleted}
              feedbackReadText={feedbackReadText}
              onReadAloud={handleReadAloud}
              readAloudTourId={FEATURE_SPOTLIGHT_TARGET_IDS.READ_ALOUD}
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
                    ) : isAwaitingRetry ? (
                      <>
                        <FeedbackPanel
                          question={question}
                          answer={{
                            selectedOptionId: lastAttempt?.selectedOptionId ?? "",
                            isCorrect: false,
                          }}
                        />
                      </>
                    ) : null}
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
            <div className="flex items-center justify-between bg-[#f8faf8] rounded-xl p-2.5 border border-[#16a34a]/20">
              <button
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-gray/20 bg-white text-slate-gray font-medium hover:bg-slate-gray/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>

              {!isCompleted ? (
                canTryAgain ? (
                  <button
                    onClick={() => {
                      setSelectedOptionId(null);
                      setRetryReadyByIndex((prev) => ({ ...prev, [currentIndex]: true }));
                      requestAnimationFrame(() => {
                        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white font-medium bg-amber-500 hover:bg-amber-600 transition-colors text-[13px]"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    Try Again
                  </button>
                ) : (
                  <button
                    onClick={submitAttempt}
                    disabled={!selectedOptionId}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit
                  </button>
                )
              ) : (
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] transition-colors text-[13px]"
                >
                  {currentIndex === totalQuestions - 1 ? "View Results" : "Next"}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeFeatureSpotlight === "read-aloud" ? (
        <FeatureSpotlight
          targetId={FEATURE_SPOTLIGHT_TARGET_IDS.READ_ALOUD}
          title="Read Aloud is available"
          description="Use Read Aloud to listen to the question and choices at any time."
          onClose={dismissReadAloudSpotlight}
        />
      ) : null}

      {activeFeatureSpotlight === "inline-glossary" ? (
        <FeatureSpotlight
          targetId={FEATURE_SPOTLIGHT_TARGET_IDS.INLINE_GLOSSARY_TERM}
          title="Inline glossary is active"
          description="Click a green biology term in the question to see its explanation."
          onClose={dismissInlineGlossarySpotlight}
        />
      ) : null}

      {activeFeatureSpotlight === "sidebar-glossary" ? (
        <FeatureSpotlight
          targetId={FEATURE_SPOTLIGHT_TARGET_IDS.SIDEBAR_GLOSSARY_BUTTON}
          title="Glossary support is available"
          description="In Practice and Review mode, glossary becomes available from your second attempt onward."
          detail="Here, you can check terms related to this question and their meanings."
          onClose={dismissSidebarGlossarySpotlight}
        />
      ) : null}

      {isGlossaryModalOpen && glossaryTerms.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/50 p-4 sm:p-6"
          onClick={() => setIsGlossaryModalOpen(false)}
        >
          <div className="mx-auto max-w-2xl h-full flex items-center justify-center">
            <div
              className="w-full max-h-[85vh] overflow-hidden rounded-xl bg-white shadow-xl border border-[#16a34a]/20"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-gray/10">
                <h3 className="text-base font-semibold text-[#14532d]">Glossary</h3>
                <button
                  onClick={() => setIsGlossaryModalOpen(false)}
                  className="p-2 rounded-lg text-slate-gray/60 hover:text-slate-gray hover:bg-slate-gray/10 transition-colors"
                  aria-label="Close glossary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[calc(85vh-56px)]">
                <div className="space-y-3">
                  {glossaryTerms.map((term) => (
                    <article
                      key={term.id}
                      className="rounded-lg border border-slate-gray/15 bg-slate-50/50 p-3"
                    >
                      <h4 className="text-sm font-semibold text-slate-gray">{term.term}</h4>
                      <p className="text-sm text-slate-gray/80 mt-1 leading-relaxed">
                        {term.definition}
                      </p>
                      {term.example && (
                        <p className="text-xs text-slate-gray/60 mt-1.5 italic">
                          Example: {term.example}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
