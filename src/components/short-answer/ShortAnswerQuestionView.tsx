"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PartLabel, ShortAnswerItem, GradedFeedback } from "@/types/short-answer";
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

interface ShortAnswerQuestionViewProps {
  item: ShortAnswerItem;
  questionId: string;
  questionSetId?: string | null;
  assignmentId?: string | null;
  /** Assignment retry boundary (= last_completed_at when the current run started). */
  assignmentRunAfter?: string | null;
  mode: "practice" | "review";
  continueLabel: string;
  onContinue: () => void;
  /** Fires once when every part has resolved (for progress bookkeeping). */
  onAllPartsResolved?: (summary: { correctParts: number; totalParts: number }) => void;
}

export function ShortAnswerQuestionView({
  item,
  questionId,
  questionSetId,
  assignmentId,
  assignmentRunAfter = null,
  mode,
  continueLabel,
  onContinue,
  onAllPartsResolved,
}: ShortAnswerQuestionViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const howToUseRef = useRef<HTMLButtonElement | null>(null);
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
  const [hydrationReady, setHydrationReady] = useState(false);
  const completionRef = useRef<HTMLDivElement | null>(null);
  const allResolvedFiredRef = useRef(false);

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
  }, [assignmentId, assignmentRunAfter, item.parts, questionId]);

  useEffect(() => {
    setHydrationReady(false);
    setShowCompletion(false);
    allResolvedFiredRef.current = false;
    setRuntimes(item.parts.map((_, i) => initialRuntime(i)));
    void hydrateFromServer();
  }, [hydrateFromServer, item.parts, questionId, assignmentId, assignmentRunAfter]);

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
        "Select text in the scenario or part questions to keep it highlighted.",
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
        "If the AI feedback looks off, tap Report. Your teacher will see it and can fix it.",
      ],
      getTarget: () => partSelector(firstLabel, "report"),
    },
    {
      id: "dots",
      stepLabel: "Attempt dots",
      title: "Track your attempts",
      lines: [
        "After answering, dots light up:",
        "• Red = wrong  • Green = correct",
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
      const part = item.parts[index];
      const runtime = runtimes[index];
      const attemptNumber = runtime.attempts.length + 1;
      if (attemptNumber > MAX_ATTEMPTS) return;

      setErrorToast(null);
      setRuntimes((prev) =>
        prev.map((r, i) => (i === index ? { ...r, status: "submitting" } : r)),
      );

      try {
        const res = await fetch("/api/short-answer/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId,
            questionSetId: questionSetId ?? null,
            assignmentId: assignmentId ?? null,
            partLabel: part.label,
            studentResponse: response,
            attemptNumber,
            mode,
            clientAttemptId: crypto.randomUUID(),
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
    [assignmentId, hydrateFromServer, item.parts, mode, questionId, questionSetId, runtimes],
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
  const statusText = showCompletion
    ? "All done!"
    : activeIndex >= 0
      ? `Answer Part ${item.parts[activeIndex].label} to continue`
      : "All parts answered";

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-4${tourOpen ? " select-none" : ""}`}
    >
      <HighlightLayer containerRef={containerRef} enabled={!tourOpen} />

      {/* Top bar: stepper + how-to-use */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1" aria-label="Progress across parts">
          {item.parts.map((part, i) => {
            const resolved = runtimes[i].status === "resolved";
            const active = i === activeIndex && !showCompletion;
            return (
              <div key={part.label} className="flex items-center">
                {i > 0 && (
                  <div
                    className={`h-0.5 w-6 ${
                      runtimes[i - 1].status === "resolved"
                        ? "bg-emerald-500"
                        : "bg-slate-300"
                    }`}
                  />
                )}
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    resolved
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-[color:var(--assignment-cta-bg-strong)] text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {resolved ? "✓" : part.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-[color:var(--foreground)]/55 sm:inline">
            {statusText}
          </span>
          <button
            ref={howToUseRef}
            type="button"
            onClick={() => setTourOpen(true)}
            className="rounded-full border border-[color:var(--assignment-panel-border)] bg-[color:var(--assignment-glass-bg)] px-3 py-1 text-[12px] font-medium text-[color:var(--foreground)]/70 transition hover:bg-[color:var(--assignment-glass-bg-strong)]"
          >
            ? How to use
          </button>
        </div>
      </div>

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
      {/* Split panel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <StimulusPanel
            stem={item.stem}
            stimulus={item.stimulus}
            showHighlightHint={!tourOpen}
          />
        </div>

        <div className="flex flex-col gap-4">
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
                index={i}
                status={runtime.status}
                attempts={runtime.attempts}
                maxAttempts={MAX_ATTEMPTS}
                latestFeedback={runtime.latestFeedback}
                triesLeft={runtime.triesLeft}
                unlock={
                  runtime.countdownActive
                    ? { label: unlockLabel, onUnlock: () => unlockNext(i) }
                    : undefined
                }
                reported={runtime.reported}
                onCheck={(response) => void handleCheck(i, response)}
                onOpenAttempt={(attempt) =>
                  setHistoryModal({ partLabel: part.label, attempt })
                }
                onReport={() => {
                  if (runtime.latestAttemptId) {
                    setReportModal({
                      partLabel: part.label,
                      partIndex: i,
                      attemptId: runtime.latestAttemptId,
                    });
                  }
                }}
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
              />
            </div>
          )}
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
