"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, Timer } from "lucide-react";
import { LatexText } from "@/components/shared/LatexText";
import type { QuestionPreview } from "@/lib/analytics/question-preview";
import type { ConfidenceQuadrantPercents } from "@/lib/analytics/confidence";

interface QuestionDetailChoice {
  id: string;
  text: string;
  isCorrect: boolean;
  count: number;
  percent: number;
}

interface QuestionDetailResponse {
  standard: { id: string; label: string } | null;
  question: {
    questionId: string;
    setId: string | null;
    preview: QuestionPreview | null;
  };
  summary: {
    attempted: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
  };
  choices: QuestionDetailChoice[];
  totalStudents: number;
  confidence: ConfidenceQuadrantPercents;
}

const EMPTY_CONFIDENCE: ConfidenceQuadrantPercents = {
  mastery: 0,
  misconception: 0,
  fragile: 0,
  expected: 0,
  total: 0,
};

const EMPTY_DATA: QuestionDetailResponse = {
  standard: null,
  question: { questionId: "", setId: null, preview: null },
  summary: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
  choices: [],
  totalStudents: 0,
  confidence: EMPTY_CONFIDENCE,
};

const FORWARDED_FILTER_KEYS = ["range", "mode", "source", "classId", "studentId"];

export default function QuestionDetailPage() {
  const params = useParams<{ standardId: string; questionId: string }>();
  const searchParams = useSearchParams();
  const standardId = decodeURIComponent(params.standardId);
  const questionId = decodeURIComponent(params.questionId);

  const [data, setData] = useState<QuestionDetailResponse>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);

  const forwardedQuery = new URLSearchParams();
  for (const key of FORWARDED_FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) forwardedQuery.set(key, value);
  }
  const qIndex = searchParams.get("qIndex");
  const qTotal = searchParams.get("qTotal");

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/teacher/standards/${encodeURIComponent(standardId)}/questions/${encodeURIComponent(questionId)}?${forwardedQuery.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.ok) {
          const json = (await response.json()) as QuestionDetailResponse;
          if (isCurrent) setData(json);
        }
      } catch (error) {
        if (
          isCurrent &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          console.error("[question-detail] failed to load question data", error);
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
  }, [standardId, questionId, searchParams.toString()]);

  const standardQuery = new URLSearchParams(forwardedQuery);
  const backHref = `/teacher-dashboard/standards/${encodeURIComponent(standardId)}${standardQuery.toString() ? `?${standardQuery.toString()}` : ""}`;

  const text = data.question.preview?.text ?? "Question text unavailable.";

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#166534] hover:text-[#14532d]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to standard
      </Link>

      <section className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className="rounded-full bg-[#16a34a]/10 px-2 py-0.5 text-[#166534]">MCQ</span>
            <span className="text-slate-gray/60">{data.standard?.id ?? standardId}</span>
          </div>
          {qIndex && qTotal && (
            <span className="text-xs font-medium text-slate-gray/50">
              Q{qIndex} of {qTotal}
            </span>
          )}
        </div>
        <p className="mt-3 text-base leading-relaxed text-slate-gray">
          {isLoading ? "Loading question..." : <LatexText text={text} />}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-gray/70">
            <span>
              Accuracy: <strong className="text-slate-gray">{data.summary.accuracy}%</strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              Avg time: <strong className="text-slate-gray">{formatDuration(data.summary.averageTimeSec)}</strong>
            </span>
            <span>{data.summary.attempted} attempts total</span>
          </div>
          {data.question.setId && (
            <Link
              href={`/content/questions/${encodeURIComponent(data.question.setId)}?edit=${encodeURIComponent(data.question.questionId)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#16a34a]/30 bg-white px-3 py-1.5 text-sm font-medium text-[#166534] transition-colors hover:bg-[#16a34a]/10"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit question
            </Link>
          )}
        </div>
      </section>

      <ChoiceBreakdown data={data} isLoading={isLoading} />

      <ConfidenceGrid confidence={data.confidence} />
    </main>
  );
}

function ChoiceBreakdown({ data, isLoading }: { data: QuestionDetailResponse; isLoading: boolean }) {
  const mostCommonWrongId = (() => {
    let id: string | null = null;
    let max = 0;
    for (const choice of data.choices) {
      if (choice.isCorrect) continue;
      if (choice.count > max) {
        max = choice.count;
        id = choice.id;
      }
    }
    return max > 0 ? id : null;
  })();

  return (
    <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-semibold text-slate-gray mb-1">Answer choices</h2>
      <p className="text-xs text-slate-gray/60 mb-4">
        Based on each student&apos;s most recent attempt. {data.totalStudents} student
        {data.totalStudents === 1 ? "" : "s"} total.
      </p>
      {data.choices.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-gray/60">
          {isLoading ? "Loading answer data..." : "No attempts recorded for this question with the current filters."}
        </p>
      ) : (
        <div className="space-y-3">
          {data.choices.map((choice, index) => {
            const isMostCommonWrong = choice.id === mostCommonWrongId;
            const label = String.fromCharCode(65 + index);
            const rowClass = choice.isCorrect
              ? "border-[#16a34a]/40 bg-[#e8f5ec]"
              : isMostCommonWrong
                ? "border-rose-100 bg-rose-50"
                : "border-slate-100 bg-white";
            const barColor = choice.isCorrect
              ? "bg-[#16a34a]"
              : isMostCommonWrong
                ? "bg-rose-500"
                : "bg-slate-300";
            const badgeClass = choice.isCorrect
              ? "bg-[#16a34a] text-white"
              : "border border-[#16a34a]/30 bg-white text-slate-gray";
            const percentClass = choice.isCorrect
              ? "text-[#166534]"
              : isMostCommonWrong
                ? "text-rose-600"
                : "text-slate-gray/70";
            return (
              <div key={choice.id} className={`flex items-center gap-3 rounded-xl border p-3 ${rowClass}`}>
                <span
                  className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${badgeClass}`}
                >
                  {label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-gray">
                    <LatexText text={choice.text} />
                  </p>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/70">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${choice.percent}%` }} />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-sm font-bold ${percentClass}`}>{choice.percent}%</p>
                  <p className="text-[10px] text-slate-gray/50">
                    {choice.count}/{data.totalStudents}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ConfidenceGrid({ confidence }: { confidence: ConfidenceQuadrantPercents }) {
  return (
    <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-gray mb-1">
        Confidence check — student self-assessment
      </h2>
      <p className="text-xs text-slate-gray/60 mb-4">
        Based on {confidence.total} confidence ratings submitted in Practice mode for this
        question.
      </p>
      {confidence.total === 0 ? (
        <p className="text-sm text-slate-gray/60">
          No confidence data has been recorded for this question yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ConfidenceCell
            value={confidence.mastery}
            label="Genuine mastery"
            sublabel="High confidence + Correct"
            className="bg-[#e8f5ec] text-[#1e5c2d]"
          />
          <ConfidenceCell
            value={confidence.misconception}
            label="Priority misconception"
            sublabel="High confidence + Wrong — hardest to fix"
            className="bg-rose-50 text-rose-700 border border-rose-200"
          />
          <ConfidenceCell
            value={confidence.fragile}
            label="Fragile understanding"
            sublabel="Low confidence + Correct — may fail under pressure"
            className="bg-amber-50 text-amber-700 border border-amber-200"
          />
          <ConfidenceCell
            value={confidence.expected}
            label="Expected gap"
            sublabel="Low confidence + Wrong — normal, system feedback helps"
            className="bg-[#f0f8f2] text-slate-gray/70"
          />
        </div>
      )}
    </section>
  );
}

function ConfidenceCell({
  value,
  label,
  sublabel,
  className,
}: {
  value: number;
  label: string;
  sublabel: string;
  className: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${className}`}>
      <p className="text-xl font-bold">{value}%</p>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-0.5 text-[10px] opacity-80">{sublabel}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}
