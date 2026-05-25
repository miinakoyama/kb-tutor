"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Download, Timer } from "lucide-react";
import { LatexText } from "@/components/shared/LatexText";
import { downloadStandardDrillDownCsv } from "@/lib/csv/teacher-dashboard-standard";
import type {
  AccuracyBucket,
  QuestionInStandardRow,
  StandardDrillDownPayload,
} from "@/lib/analytics/teacher-analytics-types";

interface Props {
  payload: StandardDrillDownPayload;
}

const BUCKET_BG: Record<AccuracyBucket, string> = {
  high: "bg-emerald-500",
  mid: "bg-amber-500",
  low: "bg-rose-500",
};

const BUCKET_LABEL: Record<AccuracyBucket, string> = {
  high: "Mostly right",
  mid: "Mixed",
  low: "Mostly wrong",
};

const BUCKET_TEXT: Record<AccuracyBucket, string> = {
  high: "text-emerald-700",
  mid: "text-amber-700",
  low: "text-rose-700",
};

const BUCKET_BORDER: Record<AccuracyBucket, string> = {
  high: "border-emerald-200 bg-emerald-50",
  mid: "border-amber-200 bg-amber-50",
  low: "border-rose-200 bg-rose-50",
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}

export function StandardDrillDownTable({ payload }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const selectedQuestionId = searchParams.get("question");

  const summary = payload.summary;
  const hasRows = payload.questions.length > 0;

  const buildUrlWithQuestion = useMemo(
    () => (questionId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("question", questionId);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );

  const onToggleExpand = (questionId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  return (
    <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-gray">
            Questions attempted under this standard
          </h2>
          <p className="mt-0.5 text-xs text-slate-gray/60">
            {summary.questionsAttempted} questions · {summary.totalAttempts}{" "}
            attempts · {summary.uniqueStudents} students ·{" "}
            <span className="font-semibold">{pct(summary.accuracy)}</span> overall
            accuracy
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadStandardDrillDownCsv(payload)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
              <th className="px-5 py-3 w-8" />
              <th className="px-3 py-3">Question</th>
              <th className="px-3 py-3 text-right">Attempted</th>
              <th className="px-3 py-3 text-right">Students</th>
              <th className="px-3 py-3 text-right">Correct</th>
              <th className="px-3 py-3">Accuracy</th>
              <th className="px-3 py-3 text-center">Practice</th>
              <th className="px-3 py-3 text-center">Exam</th>
              <th className="px-3 py-3 text-center">Review</th>
              <th className="px-3 py-3">Avg time</th>
            </tr>
          </thead>
          <tbody>
            {!hasRows && (
              <tr>
                <td
                  colSpan={10}
                  className="px-5 py-8 text-center text-sm text-slate-gray/60"
                >
                  No attempts on this standard yet for your students.
                </td>
              </tr>
            )}
            {payload.questions.map((row) => {
              const isExpanded = expanded.has(row.questionId);
              const isSelected = row.questionId === selectedQuestionId;
              return (
                <ExpandableRow
                  key={row.questionId}
                  row={row}
                  isExpanded={isExpanded}
                  isSelected={isSelected}
                  detailHref={buildUrlWithQuestion(row.questionId)}
                  onToggleExpand={() => onToggleExpand(row.questionId)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ExpandableRowProps {
  row: QuestionInStandardRow;
  isExpanded: boolean;
  isSelected: boolean;
  detailHref: string;
  onToggleExpand: () => void;
}

function ExpandableRow({
  row,
  isExpanded,
  isSelected,
  detailHref,
  onToggleExpand,
}: ExpandableRowProps) {
  return (
    <>
      <tr
        className={`border-t border-slate-100 transition-colors ${
          isSelected ? "bg-emerald-50/50" : "hover:bg-slate-50/40"
        }`}
        data-testid={`question-row-${row.questionId}`}
      >
        <td className="px-5 py-3 align-top">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Collapse question" : "Expand question"}
            aria-expanded={isExpanded}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-gray hover:bg-slate-100"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-3 py-3 align-top">
          <Link
            href={detailHref}
            className="block max-w-md text-left font-medium text-[#166534] hover:underline"
            data-testid={`question-detail-link-${row.questionId}`}
          >
            {row.preview ? (
              <span className="line-clamp-2">
                <LatexText text={row.preview.text} />
              </span>
            ) : (
              <span className="text-slate-gray/60">Preview unavailable</span>
            )}
          </Link>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-gray/50">
            id: {row.questionId}
          </p>
        </td>
        <td className="px-3 py-3 text-right align-top text-slate-gray">
          {row.attempted}
        </td>
        <td className="px-3 py-3 text-right align-top text-slate-gray">
          {row.uniqueStudents}
        </td>
        <td className="px-3 py-3 text-right align-top text-slate-gray">
          {row.correct}
        </td>
        <td className="px-3 py-3 align-top">
          <AccuracyBar accuracy={row.accuracy} bucket={row.bucket} />
        </td>
        <td className="px-3 py-3 align-top text-center">
          <ModeCell
            attempted={row.byMode.practice.attempted}
            accuracy={row.byMode.practice.accuracy}
          />
        </td>
        <td className="px-3 py-3 align-top text-center">
          <ModeCell
            attempted={row.byMode.exam.attempted}
            accuracy={row.byMode.exam.accuracy}
          />
        </td>
        <td className="px-3 py-3 align-top text-center">
          <ModeCell
            attempted={row.byMode.review.attempted}
            accuracy={row.byMode.review.accuracy}
          />
        </td>
        <td className="px-3 py-3 align-top">
          <span className="inline-flex items-center gap-1.5 text-slate-gray/70">
            <Timer className="h-3.5 w-3.5 text-slate-gray/50" />
            {formatDuration(row.averageTimeSec)}
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr
          className="border-t border-slate-100 bg-slate-50/40"
          data-testid={`question-expanded-${row.questionId}`}
        >
          <td className="px-5 py-3" />
          <td colSpan={9} className="px-3 py-4">
            <ExpandedDetail row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ row }: { row: QuestionInStandardRow }) {
  const preview = row.preview;
  return (
    <div className="space-y-3">
      {preview ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-gray">
              <LatexText text={preview.text} />
            </p>
            {preview.imageUrl && (
              // Question images are static admin-uploaded assets; no
              // user-content layout shift signal exists yet.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.imageUrl}
                alt="Question illustration"
                className="mt-3 max-h-48 rounded"
              />
            )}
          </div>
          <div className="space-y-2">
            {row.optionDistribution.map((option) => (
              <OptionBar key={option.optionId} option={option} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-gray/60">
          Preview unavailable for this question.
        </p>
      )}
    </div>
  );
}

function OptionBar({
  option,
}: {
  option: {
    optionId: string;
    text: string;
    isCorrect: boolean;
    picks: number;
    share: number;
  };
}) {
  const widthPct = Math.round(option.share * 100);
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        option.isCorrect
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between text-xs">
        <span
          className={`font-medium ${
            option.isCorrect ? "text-emerald-700" : "text-slate-gray"
          }`}
        >
          <LatexText text={option.text} />
          {option.isCorrect && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-700">
              Correct
            </span>
          )}
        </span>
        <span className="font-mono text-slate-gray/70">
          {option.picks} ({widthPct}%)
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            option.isCorrect ? "bg-emerald-500" : "bg-slate-400"
          }`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

function AccuracyBar({
  accuracy,
  bucket,
}: {
  accuracy: number;
  bucket: AccuracyBucket;
}) {
  const widthPct = Math.round(accuracy * 100);
  return (
    <div className="flex min-w-[140px] items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${BUCKET_BG[bucket]}`}
          style={{ width: `${widthPct}%` }}
          aria-label={`${pct(accuracy)} ${BUCKET_LABEL[bucket]}`}
        />
      </div>
      <span
        className={`text-sm font-semibold ${BUCKET_TEXT[bucket]}`}
        title={BUCKET_LABEL[bucket]}
      >
        {pct(accuracy)}
      </span>
      <span
        className={`hidden rounded-full border px-1.5 py-0.5 text-[10px] font-semibold sm:inline-flex ${BUCKET_BORDER[bucket]}`}
        aria-label={BUCKET_LABEL[bucket]}
      >
        {BUCKET_LABEL[bucket]}
      </span>
    </div>
  );
}

function ModeCell({
  attempted,
  accuracy,
}: {
  attempted: number;
  accuracy: number;
}) {
  if (attempted === 0) {
    return (
      <span className="text-[10px] text-slate-gray/40">no attempts</span>
    );
  }
  const tone =
    accuracy >= 0.7
      ? "text-emerald-700"
      : accuracy >= 0.55
        ? "text-amber-700"
        : "text-rose-700";
  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm font-semibold ${tone}`}>{pct(accuracy)}</span>
      <span className="text-[10px] text-slate-gray/60">{attempted}</span>
    </div>
  );
}
