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
import type { QuestionPreview } from "@/lib/analytics/question-preview";

interface StandardDetailQuestion {
  questionId: string;
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
  };
  confidence: ConfidenceQuadrantPercents;
  questions: StandardDetailQuestion[];
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
  },
  confidence: EMPTY_CONFIDENCE,
  questions: [],
};

const FORWARDED_FILTER_KEYS = ["range", "mode", "source", "classId", "studentId"];

export default function StandardDetailPage() {
  const params = useParams<{ standardId: string }>();
  const searchParams = useSearchParams();
  const standardId = decodeURIComponent(params.standardId);

  const [data, setData] = useState<StandardDetailResponse>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [mcqExpanded, setMcqExpanded] = useState(true);

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
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Breadcrumbs
        items={[
          { label: "Teacher dashboard", href: backHref },
          { label: data.standard?.id ?? standardId },
        ]}
      />

      <StandardHero standardId={standardId} data={data} thresholds={thresholds} />

      <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm p-5 sm:p-6 mb-6">
        <button
          type="button"
          onClick={() => setMcqExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-gray">
              MCQ Multiple choice questions ({data.questions.length})
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
            {data.questions.length === 0 ? (
              <p className="px-1 py-8 text-center text-sm text-slate-gray/60">
                {isLoading
                  ? "Loading question data..."
                  : "No attempts recorded for this standard with the current filters."}
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.questions.map((question, index) => (
                  <QuestionCard
                    key={question.questionId}
                    index={index}
                    total={data.questions.length}
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

      <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-gray">SAQ Short answer questions (1)</h2>
          <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-gray/60">
            Coming soon
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-gray/60">
          Short-answer question analytics will appear here in a future update.
        </p>
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
  const modePills: { label: string; value: string; metrics: ModeMetrics | null }[] = [
    { label: "Practice", value: `${data.summary.byMode.practice.accuracy}%`, metrics: data.summary.byMode.practice },
    { label: "Exam", value: `${data.summary.byMode.exam.accuracy}%`, metrics: data.summary.byMode.exam },
    { label: "Review", value: `${data.summary.byMode.review.accuracy}%`, metrics: data.summary.byMode.review },
    { label: "Avg time", value: formatDuration(data.summary.averageTimeSec), metrics: null },
  ];

  return (
    <section className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a]">
            {data.standard?.category ?? "Standard"}
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-[#14532d]">
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

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {modePills.map((pill) => (
          <div key={pill.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-slate-gray">{pill.value}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-gray/60">
              {pill.label}
            </p>
            {pill.metrics && pill.metrics.attempted > 0 && (
              <p className="mt-0.5 text-[10px] text-slate-gray/50">
                {pill.metrics.correct}/{pill.metrics.attempted} answers
              </p>
            )}
          </div>
        ))}
      </div>
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
    <article className="rounded-xl border border-slate-100 bg-white p-4 transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#16a34a]/10 px-1.5 text-xs font-bold text-[#166534]">
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
        <div className="h-2 flex-1 max-w-[220px] overflow-hidden rounded-full border border-slate-100 bg-[#f0f8f2]">
          <div
            className="h-full rounded-full bg-[#42a85a]"
            style={{ width: `${accuracyToShow.accuracy}%` }}
          />
        </div>
        <span className="text-base font-bold text-slate-gray">{accuracyToShow.accuracy}%</span>
        <span className="text-[11px] text-slate-gray/50">
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
          href={`/teacher-dashboard/standards/${encodeURIComponent(standardId)}/questions/${encodeURIComponent(question.questionId)}?${withQuestionPosition(forwardedQuery, index, total).toString()}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:text-[#14532d] hover:underline"
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
): URLSearchParams {
  const next = new URLSearchParams(query);
  next.set("qIndex", String(index + 1));
  next.set("qTotal", String(total));
  return next;
}

function questionStatus(accuracy: number, attempted: number): { label: string; tone: string } {
  if (attempted === 0) {
    return { label: "No data", tone: "border-slate-200 bg-slate-50 text-slate-500" };
  }
  if (accuracy >= 65) {
    return { label: "On track", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (accuracy >= 50) {
    return { label: "Watch", tone: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  return { label: "Needs review", tone: "border-rose-200 bg-rose-50 text-rose-700" };
}

function confidenceTag(confidence: ConfidenceQuadrantPercents): { label: string; tone: string } {
  if (confidence.total === 0) {
    return { label: "No confidence data", tone: "bg-slate-100 text-slate-500" };
  }
  if (confidence.misconception >= 15) {
    return {
      label: `⚠ ${confidence.misconception}% priority misconception`,
      tone: "bg-rose-100 text-rose-700",
    };
  }
  if (confidence.fragile >= 20) {
    return { label: `◆ ${confidence.fragile}% fragile`, tone: "bg-amber-100 text-amber-700" };
  }
  return { label: "✓ Healthy", tone: "bg-emerald-100 text-emerald-700" };
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}
