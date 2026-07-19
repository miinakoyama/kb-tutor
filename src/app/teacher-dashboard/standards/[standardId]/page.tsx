"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Timer } from "lucide-react";
import { LatexText } from "@/components/shared/LatexText";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import {
  BAND_TONES,
  findStandardBand,
} from "@/lib/analytics/band-display";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  type PerformanceThresholds,
} from "@/lib/analytics/constants";
import type {
  AttemptMode,
  ModeMetrics,
  StandardStatus,
} from "@/lib/analytics/teacher-dashboard-server";
import type { ConfidenceQuadrantPercents } from "@/lib/analytics/confidence";
import type {
  QuestionPreview,
  QuestionType,
} from "@/lib/analytics/question-preview";
import {
  badgeAmber,
  badgeEmerald,
  badgeNeutral,
  badgeRose,
} from "@/lib/ui/status-badge-styles";

interface StandardDetailQuestion {
  questionId: string;
  setId: string | null;
  questionType: QuestionType;
  preview: QuestionPreview | null;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
  practiceFirstAttempt: { n: number; correct: number; accuracy: number } | null;
  confidence: ConfidenceQuadrantPercents;
}

interface StandardDetailResponse {
  standard: { id: string; label: string; category: string; module: "A" | "B" } | null;
  summary: {
    attempted: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
    status: StandardStatus;
    byMode: Record<AttemptMode, ModeMetrics>;
    saqAverageTimeSec: number;
    saqByMode: Record<AttemptMode, ModeMetrics>;
  };
  confidence: ConfidenceQuadrantPercents;
  mcqQuestions: StandardDetailQuestion[];
  shortAnswerQuestions: StandardDetailQuestion[];
}

const EMPTY_MODE_METRICS: ModeMetrics = {
  attempted: 0,
  correct: 0,
  accuracy: 0,
  averageTimeSec: 0,
  studentsAttempted: 0,
};

const EMPTY_CONFIDENCE: ConfidenceQuadrantPercents = {
  mastery: 0,
  misconception: 0,
  fragile: 0,
  expected: 0,
  total: 0,
};

const EMPTY_DATA: StandardDetailResponse = {
  standard: null,
  summary: {
    attempted: 0,
    correct: 0,
    accuracy: 0,
    averageTimeSec: 0,
    status: "not_started",
    byMode: { practice: EMPTY_MODE_METRICS, exam: EMPTY_MODE_METRICS, review: EMPTY_MODE_METRICS },
    saqAverageTimeSec: 0,
    saqByMode: { practice: EMPTY_MODE_METRICS, exam: EMPTY_MODE_METRICS, review: EMPTY_MODE_METRICS },
  },
  confidence: EMPTY_CONFIDENCE,
  mcqQuestions: [],
  shortAnswerQuestions: [],
};

const FORWARDED_FILTER_KEYS = ["range", "mode", "source", "classId", "studentId"];

export default function StandardDetailPage() {
  const params = useParams<{ standardId: string }>();
  const searchParams = useSearchParams();
  const standardId = decodeURIComponent(params.standardId);

  const [data, setData] = useState<StandardDetailResponse>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [mcqExpanded, setMcqExpanded] = useState(true);
  const [saqExpanded, setSaqExpanded] = useState(true);

  const forwardedQuery = new URLSearchParams();
  for (const key of FORWARDED_FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) forwardedQuery.set(key, value);
  }

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/teacher/standards/${encodeURIComponent(standardId)}?${forwardedQuery.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.ok) {
          const json = (await response.json()) as StandardDetailResponse;
          if (isCurrent) setData(json);
        }
      } catch (error) {
        if (
          isCurrent &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          console.error("[standard-detail] failed to load standard data", error);
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };
    void load();

    return () => {
      isCurrent = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardId, searchParams.toString()]);

  const thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS;
  const backHref = `/teacher-dashboard${forwardedQuery.toString() ? `?${forwardedQuery.toString()}` : ""}`;

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
      <Breadcrumbs
        items={[
          { label: "Teacher dashboard", href: backHref },
          { label: data.standard?.id ?? standardId },
        ]}
      />

      <StandardHero standardId={standardId} data={data} thresholds={thresholds} />

      <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] p-5 sm:p-6 mb-6">
        <button
          type="button"
          onClick={() => setMcqExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-gray">
              MCQ Multiple choice questions ({data.mcqQuestions.length})
            </h2>
            <p className="mt-1 text-xs text-slate-gray/60">
              Click a question to view answer breakdowns and confidence data. Sorted by
              number of attempts.
            </p>
          </div>
          {mcqExpanded ? (
            <ChevronDown className="h-5 w-5 flex-shrink-0 text-slate-gray/50" />
          ) : (
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-gray/50" />
          )}
        </button>
        {mcqExpanded && (
          <>
            {data.mcqQuestions.length === 0 ? (
              <p className="px-1 py-8 text-center text-sm text-slate-gray/60">
                {isLoading
                  ? "Loading question data..."
                  : "No attempts recorded for this standard with the current filters."}
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.mcqQuestions.map((question, index) => (
                  <QuestionCard
                    key={`${question.setId ?? "legacy"}:${question.questionId}`}
                    index={index}
                    total={data.mcqQuestions.length}
                    question={question}
                    standardId={standardId}
                    forwardedQuery={forwardedQuery}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setSaqExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-gray">
              SAQ Short answer questions ({data.shortAnswerQuestions.length})
            </h2>
            <p className="mt-1 text-xs text-slate-gray/60">
              Click a question to view student responses and AI feedback. Sorted by
              number of attempts.
            </p>
          </div>
          {saqExpanded ? (
            <ChevronDown className="h-5 w-5 flex-shrink-0 text-slate-gray/50" />
          ) : (
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-gray/50" />
          )}
        </button>
        {saqExpanded && (
          <>
            {data.shortAnswerQuestions.length === 0 ? (
              <p className="px-1 py-8 text-center text-sm text-slate-gray/60">
                {isLoading
                  ? "Loading question data..."
                  : "No short-answer attempts recorded for this standard with the current filters."}
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.shortAnswerQuestions.map((question, index) => (
                  <QuestionCard
                    key={`${question.setId ?? "legacy"}:${question.questionId}`}
                    index={index}
                    total={data.shortAnswerQuestions.length}
                    question={question}
                    standardId={standardId}
                    forwardedQuery={forwardedQuery}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function StandardHero({
  standardId,
  data,
  thresholds,
}: {
  standardId: string;
  data: StandardDetailResponse;
  thresholds: PerformanceThresholds;
}) {
  const band = findStandardBand(data.summary.status, thresholds);
  const tone = BAND_TONES[data.summary.status];
  const mcqModePills: { label: string; value: string; metrics: ModeMetrics | null }[] = [
    { label: "Practice", value: `${data.summary.byMode.practice.accuracy}%`, metrics: data.summary.byMode.practice },
    { label: "Exam", value: `${data.summary.byMode.exam.accuracy}%`, metrics: data.summary.byMode.exam },
    { label: "Review", value: `${data.summary.byMode.review.accuracy}%`, metrics: data.summary.byMode.review },
    { label: "Avg time", value: formatDuration(data.summary.averageTimeSec), metrics: null },
  ];
  const saqModePills: { label: string; value: string; metrics: ModeMetrics | null }[] = [
    { label: "Practice", value: `${data.summary.saqByMode.practice.accuracy}%`, metrics: data.summary.saqByMode.practice },
    { label: "Exam", value: `${data.summary.saqByMode.exam.accuracy}%`, metrics: data.summary.saqByMode.exam },
    { label: "Review", value: `${data.summary.saqByMode.review.accuracy}%`, metrics: data.summary.saqByMode.review },
    { label: "Avg time", value: formatDuration(data.summary.saqAverageTimeSec), metrics: null },
  ];
  const hasSaqActivity = data.shortAnswerQuestions.length > 0;

  return (
    <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-5 sm:p-6 shadow-[var(--assignment-card-shadow)] mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--assignment-completed)]">
            {data.standard?.category ?? "Standard"}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading">
            {data.standard?.id ?? standardId}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-gray/80 max-w-2xl">
            {data.standard?.label ?? "Standard description not available."}
          </p>
        </div>
        <span
          className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}
        >
          {band.label}
        </span>
      </div>

      <div className="mt-5">
        {hasSaqActivity && (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
            MCQ performance
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {mcqModePills.map((pill) => (
            <div key={pill.label} className="rounded-xl border border-border-subtle bg-surface-muted/60 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-slate-gray">{pill.value}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                {pill.label}
              </p>
              {pill.metrics && pill.metrics.attempted > 0 && (
                <p className="mt-0.5 text-[10px] text-slate-gray/50">
                  {pill.metrics.correct}/{pill.metrics.attempted} correct
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {hasSaqActivity && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
            SAQ performance
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {saqModePills.map((pill) => (
              <div key={pill.label} className="rounded-xl border border-border-subtle bg-surface-muted/60 px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-slate-gray">{pill.value}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                  {pill.label}
                </p>
                {pill.metrics && pill.metrics.attempted > 0 && (
                  <p className="mt-0.5 text-[10px] text-slate-gray/50">
                    {pill.metrics.correct}/{pill.metrics.attempted} correct
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function QuestionCard({
  index,
  total,
  question,
  standardId,
  forwardedQuery,
}: {
  index: number;
  total: number;
  question: StandardDetailQuestion;
  standardId: string;
  forwardedQuery: URLSearchParams;
}) {
  const text = question.preview?.text ?? "Question text unavailable.";
  const truncated = text.length > 160 ? `${text.slice(0, 160)}…` : text;
  const status = questionStatus(question.accuracy, question.attempted);
  const confTag = confidenceTag(question.confidence);

  const accuracyToShow = question.practiceFirstAttempt ?? {
    accuracy: question.accuracy,
    n: question.attempted,
    correct: question.correct,
  };
  const accuracyLabel = question.practiceFirstAttempt ? "1st attempt" : "Accuracy";

  return (
    <article className="rounded-xl border border-border-subtle bg-surface p-4 transition-shadow hover:shadow-[var(--assignment-elevated-shadow)]">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--assignment-calendar-nav-bg)] px-1.5 text-xs font-bold text-[var(--assignment-completed)]">
          Q{index + 1}
        </span>
        <p className="flex-1 text-sm text-slate-gray">
          <LatexText text={truncated} />
        </p>
        <span
          className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.tone}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-3">
        <span className="w-16 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-gray/50">
          {accuracyLabel}
        </span>
        <div className="h-2 flex-1 max-w-[220px] overflow-hidden rounded-full border border-border-subtle bg-[var(--surface-muted)]">
          <div
            className="h-full rounded-full bg-[var(--assignment-progress-fill)]"
            style={{ width: `${accuracyToShow.accuracy}%` }}
          />
        </div>
        <span className="text-base font-bold text-slate-gray">{accuracyToShow.accuracy}%</span>
        <span className="text-[10px] text-slate-gray/50">
          {accuracyToShow.n} {accuracyToShow.n === 1 ? "attempt" : "attempts"}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pl-[76px]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-gray/60">
            <Timer className="h-3 w-3" />
            Avg time: <strong className="text-slate-gray">{formatDuration(question.averageTimeSec)}</strong>
          </span>
          <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${confTag.tone}`}>
            {confTag.label}
          </span>
        </div>
        <Link
          href={`/teacher-dashboard/standards/${encodeURIComponent(standardId)}/questions/${encodeURIComponent(question.questionId)}?${withQuestionPosition(forwardedQuery, index, total, question.setId).toString()}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:text-heading hover:underline"
        >
          View data &amp; edit
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

function withQuestionPosition(
  query: URLSearchParams,
  index: number,
  total: number,
  setId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(query);
  next.set("qIndex", String(index + 1));
  next.set("qTotal", String(total));
  if (setId) {
    next.set("setId", setId);
  } else {
    // Preserve the legacy (null set) identity instead of allowing the detail
    // route to auto-resolve a same-id generated question.
    next.set("setId", "");
  }
  return next;
}

function questionStatus(accuracy: number, attempted: number): { label: string; tone: string } {
  if (attempted === 0) {
    return { label: "No data", tone: badgeNeutral };
  }
  if (accuracy >= 65) {
    return { label: "On track", tone: badgeEmerald };
  }
  if (accuracy >= 50) {
    return { label: "Watch", tone: badgeAmber };
  }
  return { label: "Needs review", tone: badgeRose };
}

function confidenceTag(confidence: ConfidenceQuadrantPercents): { label: string; tone: string } {
  if (confidence.total === 0) {
    return { label: "No confidence data", tone: "bg-surface-muted text-muted-foreground" };
  }
  if (confidence.misconception >= 15) {
    return {
      label: `⚠ ${confidence.misconception}% priority misconception`,
      tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200",
    };
  }
  if (confidence.fragile >= 20) {
    return {
      label: `◆ ${confidence.fragile}% fragile`,
      tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    };
  }
  return {
    label: "✓ Healthy",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200",
  };
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}
