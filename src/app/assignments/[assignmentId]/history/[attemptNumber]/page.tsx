"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import type { Question } from "@/types/question";
import { FeedbackPanel } from "@/components/shared/FeedbackPanel";
import { isBookmarked, toggleBookmark } from "@/lib/storage";

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
  return (
    <Suspense
      fallback={
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
          Loading attempt...
        </main>
      }
    >
      <AttemptDetailContent />
    </Suspense>
  );
}

function AttemptDetailContent() {
  const params = useParams<{ assignmentId: string; attemptNumber: string }>();
  const searchParams = useSearchParams();
  const assignmentId = params.assignmentId;
  const attemptNumber = params.attemptNumber;
  const isDirect = searchParams.get("direct") === "1";

  const [data, setData] = useState<AttemptDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [reviewTab, setReviewTab] = useState<"wrong" | "all">("wrong");

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

  useEffect(() => {
    if (activeIndex === null) return;
    if (!data || !data.items[activeIndex]) {
      setActiveIndex(null);
    }
  }, [activeIndex, data]);

  const backToHistory = `/assignments/${encodeURIComponent(assignmentId)}/history`;

  if (isLoading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
        Loading attempt...
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <Link
          href={isDirect ? "/assignments" : backToHistory}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="w-4 h-4" />{" "}
          {isDirect ? "Back to assignments" : "Back to past attempts"}
        </Link>
        <div className="rounded-lg border border-error-border bg-error-light px-4 py-3 text-sm text-error">
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

  // --- Direct mode: wrong / all tab switcher, all expanded ---
  if (isDirect) {
    const wrongItems = items.filter((item) => !item.answer?.isCorrect);
    const displayItems = reviewTab === "wrong" ? wrongItems : items;

    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 space-y-6">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Back to assignments
        </Link>

        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading">
            Review
          </h1>
          <p className="text-muted-foreground text-sm">{assignment.title}</p>
          <p className="text-xs text-muted-foreground">
            Completed {new Date(attempt.completed_at).toLocaleString()} &middot;{" "}
            Score: {summary.correct} / {summary.total}
            {summary.total > 0 ? ` (${percent}%)` : ""}
          </p>
        </header>

        {/* Tab switcher */}
        <div className="inline-flex rounded-lg border border-border-default bg-surface-muted p-1 gap-1">
          {(["wrong", "all"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setReviewTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                reviewTab === tab
                  ? "bg-surface text-heading shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "wrong"
                ? `Wrong (${wrongItems.length})`
                : `All (${items.length})`}
            </button>
          ))}
        </div>

        {displayItems.length === 0 ? (
          <section className="rounded-xl border border-primary/30 bg-surface p-6 shadow-sm text-center">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-slate-gray font-medium">All correct!</p>
            <p className="text-sm text-muted-foreground mt-1">
              You answered every question correctly in this attempt.
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            {displayItems.map((item) => {
              const globalIndex = items.indexOf(item);
              const label =
                reviewTab === "wrong"
                  ? `Wrong question ${wrongItems.indexOf(item) + 1}`
                  : `Question ${globalIndex + 1}`;
              return (
                <WrongQuestionCard
                  key={item.question.id}
                  item={item}
                  label={label}
                />
              );
            })}
          </div>
        )}
      </main>
    );
  }

  // --- Normal mode: click-through list ---
  const activeItem = activeIndex !== null ? items[activeIndex] : undefined;
  if (activeIndex !== null && activeItem) {
    const submittedAnswer =
      activeItem.answer?.selectedOptionId != null
        ? {
            selectedOptionId: activeItem.answer.selectedOptionId,
            isCorrect: activeItem.answer.isCorrect,
          }
        : null;
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 space-y-4">
        <button
          onClick={() => setActiveIndex(null)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-heading hover:text-forest transition-colors"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <ArrowLeft className="w-4 h-4 text-heading" />
          </span>
          Back to attempt
        </button>
        <div className="rounded-xl border border-primary/30 bg-surface p-4 sm:p-6 shadow-sm">
          <p className="text-sm text-muted-foreground mb-3">
            Question {activeIndex + 1}
          </p>
          <p className="text-base font-medium text-slate-gray leading-relaxed mb-4 whitespace-pre-wrap">
            {activeItem.question.text}
          </p>
          <div className="space-y-2.5">
            {activeItem.question.options.map((opt) => {
              const isCorrect = opt.id === activeItem.question.correctOptionId;
              const isSelected = activeItem.answer?.selectedOptionId === opt.id;
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
          {submittedAnswer ? (
            <FeedbackPanel
              question={activeItem.question}
              answer={submittedAnswer}
              showKeyKnowledge
              showMisconception
            />
          ) : (
            <div className="mt-5 space-y-3">
              <div className="p-4 rounded-xl border border-border-default bg-surface-muted">
                <p className="text-sm font-semibold text-slate-gray mb-1">
                  No answer submitted
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This question was left unanswered in this attempt. The correct
                  option is highlighted above for review.
                </p>
              </div>
              {activeItem.question.keyKnowledge && (
                <div className="p-3 rounded-xl border border-primary/20 bg-primary/5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
                    Key Idea
                  </p>
                  <p className="text-sm text-slate-gray leading-relaxed">
                    {activeItem.question.keyKnowledge}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 space-y-6">
      <Link
        href={backToHistory}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="w-4 h-4" /> Back to past attempts
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading">
          Attempt {attempt.attempt_number}
        </h1>
        <p className="text-muted-foreground text-sm">{assignment.title}</p>
        <p className="text-xs text-muted-foreground">
          Completed {new Date(attempt.completed_at).toLocaleString()}
        </p>
      </header>

      <section className="rounded-xl border border-primary/30 bg-surface p-5 shadow-sm text-center">
        <p className="text-4xl font-bold text-primary mb-1">{percent}%</p>
        <p className="text-sm text-muted-foreground">
          {summary.correct} of {summary.total} correct
          {summary.answered < summary.total && (
            <> &middot; {summary.total - summary.answered} unanswered</>
          )}
        </p>
      </section>

      <section className="rounded-xl border border-primary/30 bg-surface p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-gray mb-3">
          Questions
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
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
                  className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-foreground/5 ${
                    isCorrect
                      ? "border-primary/20"
                      : hasAnswer
                        ? "border-error-border"
                        : "border-border-subtle"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-muted-foreground mt-0.5 w-5 flex-shrink-0">
                      {index + 1}
                    </span>
                    <p className="flex-1 text-sm text-slate-gray line-clamp-1">
                      {item.question.text}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      ) : hasAnswer ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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

function WrongQuestionCard({
  item,
  label,
}: {
  item: AttemptItem;
  label: string;
}) {
  const [bookmarked, setBookmarked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isBookmarked(item.question.id);
  });

  const handleBookmark = () => {
    const next = toggleBookmark(item.question.id);
    setBookmarked(next);
  };

  const submittedAnswer =
    item.answer?.selectedOptionId != null
      ? {
          selectedOptionId: item.answer.selectedOptionId,
          isCorrect: item.answer.isCorrect,
        }
      : null;

  return (
    <div className="rounded-xl border border-primary/30 bg-surface p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <button
          type="button"
          onClick={handleBookmark}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark question"}
          className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <Bookmark
            className="w-4 h-4"
            style={bookmarked ? { fill: "currentColor", color: "var(--primary)" } : undefined}
            aria-hidden="true"
          />
        </button>
      </div>

      <p className="text-base font-medium text-slate-gray leading-relaxed mb-4 whitespace-pre-wrap">
        {item.question.text}
      </p>

      <div className="space-y-2.5">
        {item.question.options.map((opt) => {
          const isCorrect = opt.id === item.question.correctOptionId;
          const isSelected = item.answer?.selectedOptionId === opt.id;
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

      {submittedAnswer && (
        <FeedbackPanel
          question={item.question}
          answer={submittedAnswer}
        />
      )}
    </div>
  );
}
