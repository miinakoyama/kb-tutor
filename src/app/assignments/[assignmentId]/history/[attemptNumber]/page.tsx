"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import type { Question } from "@/types/question";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";

interface AttemptItem {
  question: Question;
  answer: { selectedOptionId: string | null; isCorrect: boolean } | null;
}

interface AttemptDetailPayload {
  assignment: { id: string; title: string; mode: string };
  attempt: {
    attempt_number: number;
    started_at: string;
    completed_at: string;
  };
  summary: { total: number; answered: number; correct: number };
  items: AttemptItem[];
}

export default function AssignmentAttemptDetailPage() {
  const params = useParams<{ assignmentId: string; attemptNumber: string }>();
  const assignmentId = params.assignmentId;
  const attemptNumber = params.attemptNumber;

  const [data, setData] = useState<AttemptDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/assignments/${encodeURIComponent(assignmentId)}/history/${encodeURIComponent(attemptNumber)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as Partial<AttemptDetailPayload> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load attempt detail.");
      }
      setData(payload as AttemptDetailPayload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load attempt detail.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [assignmentId, attemptNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  // Defensive reset for a stale active index after `items` changes
  // (e.g. a refetch returned fewer items). Doing this in an effect
  // instead of inline during render avoids React warnings about
  // setting state while rendering, and the consequent re-render loops.
  useEffect(() => {
    if (activeIndex === null) return;
    if (!data || !data.items[activeIndex]) {
      setActiveIndex(null);
    }
  }, [activeIndex, data]);

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 text-center text-slate-gray/70">
        <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
        Loading attempt...
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <Link
          href={`/assignments/${encodeURIComponent(assignmentId)}/history`}
          className="inline-flex items-center gap-1 text-sm text-slate-gray/70 hover:text-[#16a34a]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to past attempts
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Attempt not found."}
        </div>
      </main>
    );
  }

  const { assignment, attempt, summary, items } = data;
  const percent =
    summary.total > 0
      ? Math.round((summary.correct / summary.total) * 100)
      : 0;

  const activeItem = activeIndex !== null ? items[activeIndex] : undefined;
  // When activeIndex is stale (out of bounds), fall through to the list
  // view here; the effect above resets the index to null on the next
  // tick. We deliberately do NOT call setActiveIndex during render.
  if (activeIndex !== null && activeItem) {
    // FeedbackPanel requires a non-null selectedOptionId so its option lookup
    // works. Coerce a missing answer (or `selectedOptionId === null`) to the
    // empty string — FeedbackPanel falls back to the correct option for
    // rendering in that case.
    const answer = {
      selectedOptionId: activeItem.answer?.selectedOptionId ?? "",
      isCorrect: !!activeItem.answer?.isCorrect,
    };
    return (
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10 space-y-4">
          <button
            onClick={() => setActiveIndex(null)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#14532d] hover:text-[#166534] transition-colors"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
              <ArrowLeft className="w-4 h-4 text-[#14532d]" />
            </span>
            Back to attempt
          </button>
          <div className="rounded-xl border border-[#16a34a]/30 bg-white p-4 sm:p-6 shadow-sm">
            <p className="text-sm text-slate-gray/60 mb-3">
              Question {activeIndex + 1}
            </p>
            <p className="text-base font-medium text-slate-gray leading-relaxed mb-4 whitespace-pre-wrap">
              {activeItem.question.text}
            </p>
            <div className="space-y-2.5">
              {activeItem.question.options.map((opt) => {
                const isCorrect =
                  opt.id === activeItem.question.correctOptionId;
                const isSelected =
                  activeItem.answer?.selectedOptionId === opt.id;
                const wrongSelection = isSelected && !isCorrect;
                return (
                  <div
                    key={opt.id}
                    className={`rounded-lg border px-3 py-2.5 text-sm flex items-start gap-2 ${
                      isCorrect
                        ? "border-[#16a34a]/40 bg-[#16a34a]/5"
                        : wrongSelection
                          ? "border-red-300 bg-red-50"
                          : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />
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
            <FeedbackPanel
              question={activeItem.question}
              answer={answer}
              showKeyKnowledge
              showMisconception
            />
          </div>
        </main>
      );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10 space-y-6">
      <Link
        href={`/assignments/${encodeURIComponent(assignmentId)}/history`}
        className="inline-flex items-center gap-1 text-sm text-slate-gray/70 hover:text-[#16a34a]"
      >
        <ArrowLeft className="w-4 h-4" /> Back to past attempts
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d]">
          Attempt {attempt.attempt_number}
        </h1>
        <p className="text-slate-gray/70 text-sm">{assignment.title}</p>
        <p className="text-xs text-slate-gray/60">
          Completed {new Date(attempt.completed_at).toLocaleString()}
        </p>
      </header>

      <section className="rounded-xl border border-[#16a34a]/30 bg-white p-5 shadow-sm text-center">
        <p className="text-4xl font-bold text-[#16a34a] mb-1">{percent}%</p>
        <p className="text-sm text-slate-gray/60">
          {summary.correct} of {summary.total} correct
          {summary.answered < summary.total && (
            <> &middot; {summary.total - summary.answered} unanswered</>
          )}
        </p>
      </section>

      <section className="rounded-xl border border-[#16a34a]/30 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-gray mb-3">
          Questions
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-gray/70">
            No question records available for this attempt.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => {
              const hasAnswer = item.answer !== null;
              const isCorrect = !!item.answer?.isCorrect;
              return (
                <button
                  key={`${item.question.id}-${index}`}
                  onClick={() => setActiveIndex(index)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-slate-gray/5 ${
                    isCorrect
                      ? "border-[#16a34a]/20"
                      : hasAnswer
                        ? "border-red-200"
                        : "border-slate-gray/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-slate-gray/50 mt-0.5 w-5 flex-shrink-0">
                      {index + 1}
                    </span>
                    <p className="flex-1 text-sm text-slate-gray line-clamp-1">
                      {item.question.text}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-[#16a34a]" />
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
        )}
      </section>
    </main>
  );
}
