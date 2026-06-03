"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Download, Timer, TrendingUp, XCircle } from "lucide-react";
import { LatexText } from "@/components/shared/LatexText";
import { AccuracyLineChart } from "@/components/teacher/AccuracyLineChart";
import { downloadStudentProfileCsv } from "@/lib/csv/teacher-dashboard-student";
import type {
  StudentAttemptRow,
  StudentProfilePayload,
  StudentStatus,
} from "@/lib/analytics/teacher-analytics-types";

interface Props {
  payload: StudentProfilePayload;
}

const STATUS_LABEL: Record<StudentStatus, string> = {
  on_track: "On track",
  watch: "Watch",
  struggling: "Struggling",
  not_started: "Not started",
};

const STATUS_CLASS: Record<StudentStatus, string> = {
  on_track: "bg-emerald-50 text-emerald-700 border-emerald-200",
  watch: "bg-amber-50 text-amber-700 border-amber-200",
  struggling: "bg-rose-50 text-rose-700 border-rose-200",
  not_started: "bg-slate-50 text-slate-500 border-slate-200",
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

export function StudentProfileView({ payload }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [chartView, setChartView] = useState<"rolling" | "cumulative">("rolling");
  const [loadedRows, setLoadedRows] = useState<StudentAttemptRow[]>(
    payload.answers.rows,
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    payload.answers.nextCursor,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setLoadedRows(payload.answers.rows);
    setNextCursor(payload.answers.nextCursor);
  }, [payload.answers.rows, payload.answers.nextCursor]);

  const assignmentValue = searchParams.get("assignmentId") ?? "";
  const standardValue = searchParams.get("standardId") ?? "";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("cursor");
    router.push(`${pathname}?${params.toString()}`);
  };

  const onLoadMore = async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", nextCursor);
    try {
      const apiUrl = `/api/teacher-dashboard/students/${encodeURIComponent(
        payload.student.id,
      )}?${params.toString()}`;
      const res = await fetch(apiUrl, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as StudentProfilePayload;
      setLoadedRows((prev) => [...prev, ...next.answers.rows]);
      setNextCursor(next.answers.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const onDownloadCsv = () => {
    downloadStudentProfileCsv({
      ...payload,
      answers: { rows: loadedRows, nextCursor: null },
    });
  };

  const linkFor = useMemo(
    () => (questionId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("question", questionId);
      params.set("studentId", payload.student.id);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams, payload.student.id],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total attempts"
          value={String(payload.summary.totalAttempts)}
          helper={`${payload.summary.totalCorrect} correct`}
        />
        <KpiCard
          label="Accuracy"
          value={pct(payload.summary.accuracy)}
          helper={
            payload.summary.totalAttempts === 0
              ? "no attempts yet"
              : `${payload.summary.totalCorrect}/${payload.summary.totalAttempts} answers`
          }
          accent="text-[#1d4ed8]"
          bg="bg-[#2563eb]/10"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Average time"
          value={formatDuration(payload.summary.averageTimeSec)}
          helper="per question"
          accent="text-[#b45309]"
          bg="bg-[#f59e0b]/10"
          icon={<Timer className="h-4 w-4" />}
        />
        <StatusCard status={payload.summary.status} />
      </section>

      <section className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-gray">
            Accuracy over time
          </h2>
          <div className="flex items-center gap-2">
            <ViewToggle value={chartView} onChange={setChartView} />
          </div>
        </div>
        <AccuracyLineChart points={payload.chart} view={chartView} />
      </section>

      <section className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-gray">
            Answer history
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={assignmentValue}
              onChange={(event) =>
                updateParam("assignmentId", event.target.value)
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-gray focus:border-[#16a34a] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20"
              aria-label="Filter by assignment"
            >
              <option value="">All assignments</option>
              {payload.filters.assignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.label}
                </option>
              ))}
            </select>
            <select
              value={standardValue}
              onChange={(event) =>
                updateParam("standardId", event.target.value)
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-gray focus:border-[#16a34a] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20"
              aria-label="Filter by standard"
            >
              <option value="">All standards</option>
              {payload.filters.standards.map((standard) => (
                <option key={standard.id} value={standard.id}>
                  {standard.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onDownloadCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-[#16a34a] px-3 py-1.5 text-sm font-medium text-[#166534] hover:bg-[#16a34a]/10 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
          </div>
        </div>

        {loadedRows.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50/40 px-4 py-3 text-sm text-slate-gray/60">
            No attempts match the current filters.
          </p>
        ) : (
          <ul className="space-y-2">
            {loadedRows.map((row) => (
              <li
                key={row.attemptId}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={linkFor(row.questionId)}
                    className="block max-w-3xl text-left text-sm font-medium text-[#166534] hover:underline"
                  >
                    <LatexText text={row.questionStem} />
                  </Link>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      row.isCorrect
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {row.isCorrect ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {row.isCorrect ? "Correct" : "Incorrect"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-gray/70">
                  Picked:{" "}
                  <span className="font-medium text-slate-gray">
                    {row.selectedOptionText}
                  </span>
                  {row.isCorrect ? null : (
                    <>
                      {" "}· Correct option id:{" "}
                      <span className="font-mono text-slate-gray/80">
                        {row.correctOptionId}
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-gray/60">
                  {row.mode} · {row.assignmentLabel}
                  {row.standardId ? ` · ${row.standardId}` : ""} ·{" "}
                  {row.timeSpentSec !== null
                    ? `${row.timeSpentSec}s`
                    : "time unknown"}{" "}
                  · {new Date(row.answeredAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}

        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="rounded-lg border border-[#16a34a] px-4 py-1.5 text-sm font-medium text-[#166534] hover:bg-[#16a34a]/10 transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: "rolling" | "cumulative";
  onChange: (value: "rolling" | "cumulative") => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {(["rolling", "cumulative"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
            option === value
              ? "rounded-md bg-white text-[#166534] shadow"
              : "text-slate-gray/70 hover:text-slate-gray"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
  accent = "text-[#16a34a]",
  bg = "bg-[#16a34a]/10",
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  accent?: string;
  bg?: string;
  icon?: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[#16a34a]/20 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
          {label}
        </p>
        {icon && (
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${bg} ${accent}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-gray/60">{helper}</p>
    </article>
  );
}

function StatusCard({ status }: { status: StudentStatus }) {
  return (
    <article className="rounded-2xl border border-[#16a34a]/20 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
        Status
      </p>
      <p className="mt-2">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${STATUS_CLASS[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </p>
      <p className="mt-2 text-xs text-slate-gray/60">
        {status === "on_track" && "≥ 70% accuracy"}
        {status === "watch" && "50–70% accuracy"}
        {status === "struggling" && "< 50% accuracy"}
        {status === "not_started" && "No attempts in scope"}
      </p>
    </article>
  );
}
