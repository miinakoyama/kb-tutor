"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PartLabel, ShortAnswerItem, GradedFeedback } from "@/types/short-answer";
import { Flag, HelpCircle, Highlighter } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildPartRuntimesFromStoredAttempts,
  MAX_SHORT_ANSWER_ATTEMPTS,
  type StoredShortAnswerAttempt,
} from "@/lib/short-answer/attempt-state";
import { applyAssignmentRunFilter } from "@/lib/short-answer/assignment-run";
import { StimulusPanel } from "./StimulusPanel";
import { HighlightLayer } from "./HighlightLayer";
import { PartCard, type PartStatus } from "./PartCard";
import { AttemptHistoryModal, type AttemptHistoryEntry } from "./AttemptHistoryModal";
import { GlossaryPopup } from "./GlossaryPopup";
import { CompletionSection } from "./CompletionSection";
import { ReportFeedbackModal } from "./ReportFeedbackModal";
import { SpotlightTour, type TourStep } from "./SpotlightTour";
import {
  isShortAnswerTourSeenLocally,
  syncShortAnswerTourSeen,
} from "@/lib/short-answer/tour-settings";

const MAX_ATTEMPTS = MAX_SHORT_ANSWER_ATTEMPTS;
const FOCUS_LOSS_FLUSH_GRACE_MS = 400;

function isDocumentActiveForTiming(): boolean {
  if (typeof document === "undefined") return false;
  return !document.hidden && document.hasFocus();
}

interface PartRuntime {
  status: PartStatus;
  attempts: AttemptHistoryEntry[];
  latestFeedback: GradedFeedback | null;
  latestAttemptId: string | null;
  triesLeft: number;
  reported: boolean;
  /** True while this part's resolution countdown is running. */
  countdownActive: boolean;
}

function initialRuntime(index: number): PartRuntime {
  return {
    status: index === 0 ? "active" : "locked",
    attempts: [],
    latestFeedback: null,
    latestAttemptId: null,
    triesLeft: MAX_ATTEMPTS,
    reported: false,
    countdownActive: false,
  };
}

interface GradeResponse {
  attemptId: string;
  score: number;
  maxScore: number;
  correct: boolean;
  resolved: boolean;
  feedback: GradedFeedback;
  triesLeft: number;
}

/** Wrap the first longish word of an element's first text node in a demo mark. */
function wrapDemoWord(el: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const match = /\b[A-Za-z]{6,}\b/.exec(text);
    if (match && match.index >= 0) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const mark = document.createElement("mark");
      mark.className = "sa-hl sa-hl-demo";
      try {
        range.surroundContents(mark);
        return mark;
      } catch {
        return null;
      }
    }
    node = walker.nextNode();
  }
  return null;
}

function unwrapDemoMark(mark: HTMLElement) {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

// Same frosted-glass recipe as the practice-mode Glossary button and the
// calendar nav buttons: translucent blurred glass, hairline border, soft
// nav-shadow. Neutral by default; the active states tint the border/icon
// only, keeping the glass background and blur consistent.
const TOOLBAR_BUTTON_CLASS =
  "flex h-8 w-8 items-center justify-center rounded-full bg-[var(--assignment-calendar-nav-bg)] hover:bg-[var(--assignment-calendar-nav-bg-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--assignment-calendar-nav-bg)]";

function toolbarButtonStyle(borderColor: string, iconColor: string) {
  return {
    border: `1px solid ${borderColor}`,
    // Tighter than --assignment-nav-shadow — these are small 32px buttons
    // in a dense toolbar, the full nav-shadow spread reads too heavy here.
    boxShadow: "0 2px 5px rgb(12 107 69 / 0.10)",
    backdropFilter: "blur(10px) saturate(130%)",
    WebkitBackdropFilter: "blur(10px) saturate(130%)",
    color: iconColor,
  } as const;
}

const TOOLBAR_BORDER_NEUTRAL = "var(--assignment-glass-border)";
const TOOLBAR_COLOR_NEUTRAL = "var(--foreground)";
const TOOLBAR_BORDER_GREEN = "var(--assignment-completed-muted)";
const TOOLBAR_COLOR_GREEN = "var(--mastery-mastered)";
const TOOLBAR_BORDER_RED = "var(--error-border)";
const TOOLBAR_COLOR_RED = "var(--error-color)";

interface ShortAnswerQuestionViewProps {
  item: ShortAnswerItem;
  questionId: string;
  questionSetId?: string | null;
  assignmentId?: string | null;
  sessionId?: string | null;
  /** Assignment retry boundary (= last_completed_at when the current run started). */
  assignmentRunAfter?: string | null;
  mode: "practice" | "review";
  continueLabel: string;
  onContinue: () => void;
  showCompletionContinue?: boolean;
  /** Fires once when every part has resolved (for progress bookkeeping). */
  onAllPartsResolved?: (summary: { correctParts: number; totalParts: number }) => void;
}

export function ShortAnswerQuestionView({
  item,
  questionId,
  questionSetId,
  assignmentId,
  sessionId = null,
  assignmentRunAfter = null,
  mode,
  continueLabel,
  onContinue,
  showCompletionContinue = true,
  onAllPartsResolved,
}: ShortAnswerQuestionViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const howToUseRef = useRef<HTMLButtonElement | null>(null);
  const reportButtonRef = useRef<HTMLButtonElement | null>(null);
  const demoMarkRef = useRef<HTMLElement | null>(null);

  const [runtimes, setRuntimes] = useState<PartRuntime[]>(
    item.parts.map((_, i) => initialRuntime(i)),
  );
  const [showCompletion, setShowCompletion] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [historyModal, setHistoryModal] = useState<{
    partLabel: PartLabel;
    attempt: AttemptHistoryEntry;
  } | null>(null);
  const [reportModal, setReportModal] = useState<{
    partLabel: PartLabel;
    partIndex: number;
    attemptId: string;
  } | null>(null);
  const [glossary, setGlossary] = useState<{
    term: string;
    definition: string;
    x: number;
    y: number;
  } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  // Off by default (FR-010): the shared HighlightLayer only wraps
  // selections while the student has explicitly turned the tool on.
  const [highlightModeOn, setHighlightModeOn] = useState(false);
  const [hydrationReady, setHydrationReady] = useState(false);
  const completionRef = useRef<HTMLDivElement | null>(null);
  const allResolvedFiredRef = useRef(false);
  // Total dwell time since this question was first shown, across all part
  // submissions/retries — mirrors AdaptivePracticeMode's visibility-aware
  // dwell tracking. Only the call that finalizes the last unresolved part
  // actually persists this value (see maybeRecordQuestionSummary).
  const dwellMsRef = useRef(0);
  const visitStartRef = useRef<number | null>(null);
  const blurFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurFlushTimer = useCallback(() => {
    if (blurFlushTimerRef.current === null) return;
    clearTimeout(blurFlushTimerRef.current);
    blurFlushTimerRef.current = null;
  }, []);

  const flushVisit = useCallback(() => {
    const startMs = visitStartRef.current;
    if (startMs === null) return;
    dwellMsRef.current += Math.max(0, Date.now() - startMs);
    visitStartRef.current = null;
  }, []);

  const resetDwell = useCallback(() => {
    clearBlurFlushTimer();
    flushVisit();
    dwellMsRef.current = 0;
    visitStartRef.current = null;
  }, [clearBlurFlushTimer, flushVisit]);

  // Auto-open the tour on first exposure to a short-answer question.
  useEffect(() => {
    let cancelled = false;
    if (isShortAnswerTourSeenLocally()) return;
    void syncShortAnswerTourSeen().then((seen) => {
      if (!cancelled && !seen) setTourOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const partSelector = useCallback(
    (label: PartLabel, part: string) =>
      containerRef.current?.querySelector<HTMLElement>(
        `[data-tour="part-${label}-${part}"]`,
      ) ?? null,
    [],
  );

  const firstLabel = item.parts[0]?.label ?? "A";

  const hydrateFromServer = useCallback(async (): Promise<boolean> => {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setHydrationReady(true);
      return false;
    }

    let query = supabase
      .from("short_answer_attempts")
      .select("id, part_label, attempt_number, response_text, feedback, is_correct")
      .eq("question_id", questionId)
      .eq("user_id", user.id)
      .order("part_label")
      .order("attempt_number", { ascending: true });

    query = assignmentId
      ? query.eq("assignment_id", assignmentId)
      : query.is("assignment_id", null);
    query = applyAssignmentRunFilter(query, assignmentId, assignmentRunAfter);
    if (!assignmentId) {
      query = sessionId
        ? query.eq("session_id", sessionId)
        : query.is("session_id", null);
    }

    const { data, error } = await query;
    if (error || !data?.length) {
      setHydrationReady(true);
      return false;
    }

    const { runtimes: restored, allResolved } = buildPartRuntimesFromStoredAttempts(
      item.parts,
      data as StoredShortAnswerAttempt[],
    );
    setRuntimes(restored);
    if (allResolved) {
      setShowCompletion(true);
    }
    setHydrationReady(true);
    return true;
  }, [assignmentId, assignmentRunAfter, item.parts, questionId, sessionId]);

  useEffect(() => {
    setHydrationReady(false);
    setShowCompletion(false);
    allResolvedFiredRef.current = false;
    setRuntimes(item.parts.map((_, i) => initialRuntime(i)));
    resetDwell();
    void hydrateFromServer();
  }, [
    hydrateFromServer,
    item.parts,
    questionId,
    assignmentId,
    assignmentRunAfter,
    sessionId,
    resetDwell,
  ]);

  // Start/stop the dwell clock: running whenever the question is hydrated
  // and not yet fully resolved, paused while the tab is hidden/unfocused.
  useEffect(() => {
    if (!hydrationReady || showCompletion) {
      clearBlurFlushTimer();
      flushVisit();
      return;
    }
    if (isDocumentActiveForTiming()) {
      visitStartRef.current = Date.now();
    }
    return () => {
      clearBlurFlushTimer();
      flushVisit();
    };
  }, [hydrationReady, showCompletion, clearBlurFlushTimer, flushVisit]);

  useEffect(() => {
    if (!hydrationReady || showCompletion) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearBlurFlushTimer();
        flushVisit();
        return;
      }
      if (!document.hasFocus()) return;
      clearBlurFlushTimer();
      if (visitStartRef.current === null) {
        visitStartRef.current = Date.now();
      }
    };
    const handleWindowBlur = () => {
      clearBlurFlushTimer();
      blurFlushTimerRef.current = setTimeout(() => {
        blurFlushTimerRef.current = null;
        flushVisit();
      }, FOCUS_LOSS_FLUSH_GRACE_MS);
    };
    const handleWindowFocus = () => {
      clearBlurFlushTimer();
      if (!isDocumentActiveForTiming()) return;
      if (visitStartRef.current === null) {
        visitStartRef.current = Date.now();
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
  }, [hydrationReady, showCompletion, clearBlurFlushTimer, flushVisit]);

  const tourSteps: TourStep[] = [
    {
      id: "welcome",
      stepLabel: "Welcome",
      title: "Quick tour — 30 seconds",
      lines: [
        "We'll show you 4 things that make this question type easier.",
        "You can reopen this tour anytime with this button.",
      ],
      getTarget: () => howToUseRef.current,
    },
    {
      id: "highlight",
      stepLabel: "Highlight",
      title: "Highlight key text",
      lines: [
        "Turn on the highlighter in the toolbar above, then select text to keep it highlighted.",
        "Click a highlight to remove it.",
      ],
      getTarget: () => partSelector(firstLabel, "prompt"),
      onEnter: () => {
        const promptEl = partSelector(firstLabel, "prompt");
        if (promptEl && !demoMarkRef.current) {
          demoMarkRef.current = wrapDemoWord(promptEl);
        }
      },
      onLeave: () => {
        if (demoMarkRef.current) {
          unwrapDemoMark(demoMarkRef.current);
          demoMarkRef.current = null;
        }
      },
    },
    {
      id: "report",
      stepLabel: "Report",
      title: "Report if feedback seems wrong",
      lines: [
        "If the AI feedback looks off, tap Report in the toolbar. Your teacher will see it and can fix it.",
      ],
      getTarget: () => reportButtonRef.current,
    },
    {
      id: "dots",
      stepLabel: "Attempt dots",
      title: "Track your attempts",
      lines: [
        "After answering, dots light up:",
        "• Yellow = wrong  • Green = correct",
        "Tap one to see what you wrote and the feedback.",
      ],
      getTarget: () => partSelector(firstLabel, "dots"),
    },
  ];

  const unlockNext = useCallback(
    (index: number) => {
      setRuntimes((prev) =>
        prev.map((r, i) =>
          i === index
            ? { ...r, countdownActive: false }
            : i === index + 1 && r.status === "locked"
              ? { ...r, status: "active" }
              : r,
        ),
      );
      if (index + 1 >= item.parts.length) {
        setShowCompletion(true);
        window.setTimeout(() => {
          completionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 60);
      } else {
        window.setTimeout(() => {
          // Target the response-column card specifically (not the whole
          // page): the stimulus panel is lg:sticky, so it stays put while
          // this centers the new current part in the viewport.
          containerRef.current
            ?.querySelector(`[aria-label="Part ${item.parts[index + 1].label}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60);
      }
    },
    [item.parts],
  );

  const handleCheck = useCallback(
    async (index: number, response: string) => {
      if (!assignmentId && !sessionId) {
        setErrorToast("Preparing your practice session. Please try again in a moment.");
        return;
      }

      const part = item.parts[index];
      const runtime = runtimes[index];
      const attemptNumber = runtime.attempts.length + 1;
      if (attemptNumber > MAX_ATTEMPTS) return;

      setErrorToast(null);
      setRuntimes((prev) =>
        prev.map((r, i) => (i === index ? { ...r, status: "submitting" } : r)),
      );

      flushVisit();
      const timeSpentSec = Math.max(5, Math.round(dwellMsRef.current / 1000));
      if (isDocumentActiveForTiming()) {
        visitStartRef.current = Date.now();
      }

      try {
        const res = await fetch("/api/short-answer/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId,
            questionSetId: questionSetId ?? null,
            assignmentId: assignmentId ?? null,
            sessionId: assignmentId ? null : sessionId,
            partLabel: part.label,
            studentResponse: response,
            attemptNumber,
            mode,
            clientAttemptId: crypto.randomUUID(),
            timeSpentSec,
          }),
        });

        if (!res.ok) {
          if (res.status === 409) {
            const restored = await hydrateFromServer();
            setRuntimes((prev) =>
              prev.map((r, i) => (i === index ? { ...r, status: "active" } : r)),
            );
            if (!restored) {
              setErrorToast(
                "This attempt was already recorded for this question. Refresh the page if the display looks out of date.",
              );
            }
            return;
          }

          // 502 and other failures do not consume the attempt.
          setRuntimes((prev) =>
            prev.map((r, i) => (i === index ? { ...r, status: "active" } : r)),
          );
          const message =
            res.status === 404
              ? "This question could not be loaded. Ask your teacher to check the assignment setup."
              : res.status === 502
                ? "We couldn't check your answer just now. Your attempt wasn't used — please try again."
                : "Something went wrong while checking your answer. Please try again.";
          setErrorToast(message);
          return;
        }

        const data = (await res.json()) as GradeResponse;
        const entry: AttemptHistoryEntry = {
          attemptNumber,
          correct: data.correct,
          responseText: response,
          feedback: data.feedback,
        };

        setRuntimes((prev) =>
          prev.map((r, i) =>
            i === index
              ? {
                  ...r,
                  status: data.resolved ? "resolved" : "active",
                  attempts: [...r.attempts, entry],
                  latestFeedback: data.feedback,
                  latestAttemptId: data.attemptId,
                  triesLeft: data.triesLeft,
                  countdownActive: data.resolved,
                }
              : r,
          ),
        );
      } catch {
        setRuntimes((prev) =>
          prev.map((r, i) => (i === index ? { ...r, status: "active" } : r)),
        );
        setErrorToast(
          "We couldn't check your answer just now. Your attempt wasn't used — please try again.",
        );
      }
    },
    [
      assignmentId,
      flushVisit,
      hydrateFromServer,
      item.parts,
      mode,
      questionId,
      questionSetId,
      runtimes,
      sessionId,
    ],
  );

  // Fire the all-resolved callback once.
  useEffect(() => {
    if (allResolvedFiredRef.current) return;
    if (runtimes.every((r) => r.status === "resolved")) {
      allResolvedFiredRef.current = true;
      onAllPartsResolved?.({
        correctParts: runtimes.filter((r) => r.attempts.some((a) => a.correct)).length,
        totalParts: runtimes.length,
      });
    }
  }, [runtimes, onAllPartsResolved]);

  const handleGlossaryClick = useCallback(
    (term: string, event: React.MouseEvent) => {
      const keyTerm = item.keyTerms.find(
        (kt) => kt.term.toLowerCase() === term.toLowerCase(),
      );
      setGlossary({
        term,
        definition: keyTerm?.definition ?? "Definition not available.",
        x: event.clientX,
        y: event.clientY,
      });
    },
    [item.keyTerms],
  );

  const activeIndex = runtimes.findIndex((r) => r.status !== "resolved");
  const waitingForPracticeSession = !assignmentId && !sessionId;

  // The toolbar's Report button always targets whichever part the student is
  // currently engaging with: the active part, or — during the brief unlock
  // countdown right after answering — the part that just resolved (the next
  // part is still locked at that point, so it can't be the target).
  let focusIndex = -1;
  for (let i = runtimes.length - 1; i >= 0; i--) {
    if (runtimes[i].status !== "locked") {
      focusIndex = i;
      break;
    }
  }
  const focusRuntime = focusIndex >= 0 ? runtimes[focusIndex] : undefined;
  const canReportFocusPart = Boolean(focusRuntime?.latestAttemptId) && !focusRuntime?.reported;

  const handleToolbarReport = useCallback(() => {
    if (focusIndex < 0) return;
    const runtime = runtimes[focusIndex];
    if (!runtime?.latestAttemptId || runtime.reported) return;
    setReportModal({
      partLabel: item.parts[focusIndex].label,
      partIndex: focusIndex,
      attemptId: runtime.latestAttemptId,
    });
  }, [focusIndex, runtimes, item.parts]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-4${tourOpen ? " select-none" : ""}`}
    >
      <HighlightLayer containerRef={containerRef} enabled={highlightModeOn && !tourOpen} />

      {errorToast && (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--error-border)] bg-[color:var(--error-light)] px-4 py-2 text-[13px] text-[color:var(--error-color)]"
        >
          {errorToast}
        </div>
      )}

      {!hydrationReady ? (
        <div className="rounded-xl border border-[color:var(--assignment-panel-border)] bg-[color:var(--assignment-glass-bg)] px-4 py-6 text-center text-sm text-[color:var(--foreground)]/60">
          Loading your saved progress…
        </div>
      ) : (
      <>
      {/* Split workspace: one shared surface with a subtle internal divider.
          44% question/stimulus | divider | 52% response; single column below
          lg (stimulus first, then response with its integrated feedback). */}
      <div
        className="rounded-[24px] border"
        style={{
          background: "var(--assignment-glass-bg-strong)",
          borderColor: "var(--assignment-glass-border)",
          boxShadow: "var(--assignment-card-shadow)",
        }}
      >
        {/* Question subheader: overall part progress (left) + how-to-use
            (right). The only place part progression is communicated at the
            workspace level — locked rows and the active card header carry
            the rest. */}
        <div
          className="flex h-[68px] items-center justify-between gap-3 border-b px-5 sm:px-8 lg:px-10"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1" aria-label="Progress across parts">
              {item.parts.map((part, i) => {
                const resolved = runtimes[i].status === "resolved";
                const active = i === activeIndex && !showCompletion;
                return (
                  <div key={part.label} className="flex items-center">
                    {i > 0 && (
                      <div
                        className="h-0.5 w-6"
                        style={{
                          background:
                            runtimes[i - 1].status === "resolved"
                              ? "var(--assignment-completed-muted)"
                              : "var(--border-default)",
                        }}
                      />
                    )}
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors"
                      style={{
                        fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                        ...(active
                          ? {
                              background: "var(--assignment-completed)",
                              color: "var(--assignment-on-accent)",
                            }
                          : resolved
                            ? {
                                background: "var(--assignment-completed-muted)",
                                color: "var(--assignment-on-accent)",
                              }
                            : {
                                background: "var(--assignment-row-cta-bg)",
                                color: "var(--muted-foreground)",
                              }),
                      }}
                    >
                      {resolved ? "✓" : part.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Toolbar: highlighter, report, how-to-use — consolidated here
              instead of duplicated inside the stimulus panel / part card. */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHighlightModeOn((prev) => !prev)}
              aria-pressed={highlightModeOn}
              title={
                highlightModeOn
                  ? "Highlighter on — select text to highlight, click a highlight to remove it"
                  : "Turn on the highlighter to mark up text"
              }
              aria-label="Toggle highlighter"
              className={TOOLBAR_BUTTON_CLASS}
              style={
                highlightModeOn
                  ? toolbarButtonStyle(TOOLBAR_BORDER_GREEN, TOOLBAR_COLOR_GREEN)
                  : toolbarButtonStyle(TOOLBAR_BORDER_NEUTRAL, TOOLBAR_COLOR_NEUTRAL)
              }
            >
              <Highlighter className="h-4 w-4" aria-hidden />
            </button>

            <button
              ref={reportButtonRef}
              type="button"
              onClick={handleToolbarReport}
              disabled={!canReportFocusPart}
              aria-pressed={Boolean(focusRuntime?.reported)}
              title={
                focusRuntime?.reported
                  ? "Reported — your teacher will review this feedback"
                  : "Report if the feedback on the current part seems wrong"
              }
              aria-label="Report feedback"
              className={TOOLBAR_BUTTON_CLASS}
              style={
                focusRuntime?.reported
                  ? toolbarButtonStyle(TOOLBAR_BORDER_RED, TOOLBAR_COLOR_RED)
                  : toolbarButtonStyle(TOOLBAR_BORDER_NEUTRAL, TOOLBAR_COLOR_NEUTRAL)
              }
            >
              <Flag className="h-4 w-4" aria-hidden />
            </button>

            <button
              ref={howToUseRef}
              type="button"
              onClick={() => setTourOpen(true)}
              title="How to use"
              aria-label="How to use"
              className={TOOLBAR_BUTTON_CLASS}
              style={toolbarButtonStyle(TOOLBAR_BORDER_NEUTRAL, TOOLBAR_COLOR_NEUTRAL)}
            >
              <HelpCircle className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,44fr)_1px_minmax(0,52fr)]">
        <div className="p-5 sm:p-8 lg:p-10">
          <div className="lg:sticky lg:top-6">
            <StimulusPanel
              stem={item.stem}
              stimulus={item.stimulus}
              framed={false}
            />
          </div>
        </div>

        <div
          aria-hidden
          className="h-px mx-5 sm:mx-8 lg:mx-0 lg:h-auto lg:w-px"
          style={{ background: "var(--border-subtle)" }}
        />

        <div className="flex flex-col gap-3 p-5 sm:p-8 lg:p-10">
          {item.parts.map((part, i) => {
            const runtime = runtimes[i];
            const isLast = i === item.parts.length - 1;
            const unlockLabel = isLast
              ? "Loading summary in"
              : `Part ${item.parts[i + 1].label} unlocks in`;
            return (
              <PartCard
                key={part.label}
                part={part}
                status={runtime.status}
                attempts={runtime.attempts}
                maxAttempts={MAX_ATTEMPTS}
                latestFeedback={runtime.latestFeedback}
                triesLeft={runtime.triesLeft}
                initialValue={
                  runtime.attempts[runtime.attempts.length - 1]?.responseText ?? ""
                }
                checkDisabled={waitingForPracticeSession}
                previousLabel={i > 0 ? item.parts[i - 1].label : undefined}
                unlock={
                  runtime.countdownActive
                    ? { label: unlockLabel, onUnlock: () => unlockNext(i) }
                    : undefined
                }
                onCheck={(response) => void handleCheck(i, response)}
                onOpenAttempt={(attempt) =>
                  setHistoryModal({ partLabel: part.label, attempt })
                }
                onGlossaryClick={handleGlossaryClick}
              />
            );
          })}

          {showCompletion && (
            <div ref={completionRef}>
              <CompletionSection
                questionId={questionId}
                keyTerms={item.keyTerms}
                continueLabel={continueLabel}
                onContinue={onContinue}
                showNotes={false}
                showContinueButton={showCompletionContinue}
              />
            </div>
          )}
        </div>
        </div>
      </div>
      </>
      )}

      {historyModal && (
        <AttemptHistoryModal
          partLabel={historyModal.partLabel}
          attempt={historyModal.attempt}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {reportModal && (
        <ReportFeedbackModal
          partLabel={reportModal.partLabel}
          attemptId={reportModal.attemptId}
          questionId={questionId}
          onClose={() => setReportModal(null)}
          onReported={() =>
            setRuntimes((prev) =>
              prev.map((r, i) =>
                i === reportModal.partIndex ? { ...r, reported: true } : r,
              ),
            )
          }
        />
      )}

      {glossary && (
        <GlossaryPopup
          term={glossary.term}
          definition={glossary.definition}
          x={glossary.x}
          y={glossary.y}
          onDismiss={() => setGlossary(null)}
        />
      )}

      {tourOpen && <SpotlightTour steps={tourSteps} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
