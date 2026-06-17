"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Timer,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StudentAvatar } from "@/components/StudentAvatar";
import { LatexText } from "@/components/shared/LatexText";
import {
  BAND_TONES,
  findStudentBand,
} from "@/lib/analytics/band-display";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  type PerformanceThresholds,
} from "@/lib/analytics/constants";
import type {
  AttemptMode,
  ModeMetrics,
  StandardStatus,
  StudentStatus,
} from "@/lib/analytics/teacher-dashboard-server";
import type { QuestionPreview } from "@/lib/analytics/question-preview";

interface AccuracyOverTimePoint {
  date: string;
  accuracy: number;
  attempted: number;
}

interface StudentDetailStandardRow {
  standardId: string;
  standardLabel: string;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
  status: StandardStatus;
}

interface StudentDetailQuestionRow {
  questionId: string;
  standardId: string | null;
  preview: QuestionPreview | null;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
  lastAttemptedAt: string;
}

interface StudentDetailResponse {
  student: { id: string; label: string; classId: string | null } | null;
  summary: {
    attempted: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
    status: StudentStatus;
    isLowAndFast: boolean;
  };
  byMode: Record<AttemptMode, ModeMetrics>;
  accuracyOverTime: AccuracyOverTimePoint[];
  byStandard: StudentDetailStandardRow[];
  byQuestion: StudentDetailQuestionRow[];
  thresholds: PerformanceThresholds;
  defaults: PerformanceThresholds;
  thresholdsAreCustom: boolean;
}

const EMPTY_MODE_METRICS: ModeMetrics = {
  attempted: 0,
  correct: 0,
  accuracy: 0,
  averageTimeSec: 0,
  studentsAttempted: 0,
};

const EMPTY_DATA: StudentDetailResponse = {
  student: null,
  summary: {
    attempted: 0,
    correct: 0,
    accuracy: 0,
    averageTimeSec: 0,
    status: "not_started",
    isLowAndFast: false,
  },
  byMode: { practice: EMPTY_MODE_METRICS, exam: EMPTY_MODE_METRICS, review: EMPTY_MODE_METRICS },
  accuracyOverTime: [],
  byStandard: [],
  byQuestion: [],
  thresholds: DEFAULT_PERFORMANCE_THRESHOLDS,
  defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
  thresholdsAreCustom: false,
};

const FORWARDED_FILTER_KEYS = ["range", "mode", "source", "classId"];

const MODE_LABELS: Record<AttemptMode, string> = {
  practice: "Practice",
  exam: "Exam",
  review: "Review",
};

const MODE_BAR_COLORS: Record<AttemptMode, string> = {
  practice: "#f59e0b",
  exam: "#3b82f6",
  review: "#ef4444",
};

type TabKey = "overview" | "standards" | "questions";

export default function StudentDetailPage() {
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();
  const studentId = decodeURIComponent(params.studentId);

  const [data, setData] = useState<StudentDetailResponse>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");

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
          `/api/teacher/students/${encodeURIComponent(studentId)}?${forwardedQuery.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.ok) {
          const json = (await response.json()) as StudentDetailResponse;
          if (isCurrent) setData(json);
        }
      } catch (error) {
        if (
          isCurrent &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          console.error("[student-detail] failed to load student data", error);
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
  }, [studentId, searchParams.toString()]);

  const backHref = `/teacher-dashboard${forwardedQuery.toString() ? `?${forwardedQuery.toString()}` : ""}`;
  const standardDetailQuery = new URLSearchParams(forwardedQuery);
  standardDetailQuery.set("studentId", studentId);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#166534] hover:text-[#14532d]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <StudentHero studentId={studentId} data={data} />

      <TabBar tab={tab} onChange={setTab} />

      {tab === "overview" && <OverviewTab data={data} isLoading={isLoading} />}
      {tab === "standards" && (
        <StandardsTab
          data={data}
          isLoading={isLoading}
          standardDetailQuery={standardDetailQuery}
        />
      )}
      {tab === "questions" && (
        <QuestionsTab
          data={data}
          isLoading={isLoading}
          standardDetailQuery={standardDetailQuery}
        />
      )}
    </main>
  );
}

function StudentHero({
  studentId,
  data,
}: {
  studentId: string;
  data: StudentDetailResponse;
}) {
  const label = data.student?.label ?? studentId;
  const band = findStudentBand(data.summary.status, data.thresholds);
  const tone = BAND_TONES[data.summary.status];

  return (
    <section className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StudentAvatar label={label} />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#14532d]">{label}</h1>
            <span
              className={`mt-1 inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}
            >
              {band.label}
            </span>
            {data.summary.isLowAndFast && (
              <span className="ml-2 mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                <AlertTriangle className="h-3 w-3" />
                Clicking without engaging
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat label="Attempted" value={String(data.summary.attempted)} />
          <HeroStat label="Correct" value={String(data.summary.correct)} />
          <HeroStat
            label="Accuracy"
            value={data.summary.attempted > 0 ? `${data.summary.accuracy}%` : "—"}
            valueClass={tone.text}
          />
          <HeroStat label="Avg time" value={formatDuration(data.summary.averageTimeSec)} />
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-center">
      <p className={`text-lg font-bold ${valueClass ?? "text-slate-gray"}`}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-gray/60">{label}</p>
    </div>
  );
}

function TabBar({ tab, onChange }: { tab: TabKey; onChange: (tab: TabKey) => void }) {
  const tabs: { value: TabKey; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "standards", label: "By Standard" },
    { value: "questions", label: "By Question" },
  ];
  return (
    <div className="mb-6 flex items-center gap-4 border-b border-slate-200">
      {tabs.map((item) => {
        const active = item.value === tab;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`-mb-px border-b-2 px-1.5 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
              active
                ? "border-[#16a34a] text-[#14532d]"
                : "border-transparent text-slate-gray/60 hover:text-slate-gray"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function OverviewTab({
  data,
  isLoading,
}: {
  data: StudentDetailResponse;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-gray">Accuracy over time</h2>
          <span className="text-xs text-slate-gray/60">Performance trend across sessions</span>
        </div>
        {data.accuracyOverTime.length < 2 ? (
          <p className="px-1 py-8 text-center text-sm text-slate-gray/60">
            {isLoading
              ? "Loading trend data..."
              : "Not enough attempts yet to show a trend."}
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.accuracyOverTime} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  formatter={(value?: number | string) => [`${value ?? 0}%`, "Accuracy"]}
                  labelFormatter={(label) => formatChartDate(String(label ?? ""))}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#16a34a" }}
                  label={{
                    position: "top",
                    fontSize: 11,
                    fill: "#166534",
                    formatter: (value: unknown) => `${typeof value === "number" ? value : 0}%`,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-gray mb-4">Mode comparison</h2>
          <ModeComparison byMode={data.byMode} />
        </section>

        <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-gray mb-4">Engagement signal</h2>
          <EngagementSignal summary={data.summary} />
        </section>
      </div>
    </div>
  );
}

function ModeComparison({ byMode }: { byMode: Record<AttemptMode, ModeMetrics> }) {
  const modes: AttemptMode[] = ["practice", "exam", "review"];
  return (
    <ul className="space-y-3">
      {modes.map((m) => {
        const metrics = byMode[m];
        const hasAttempts = metrics.attempted > 0;
        return (
          <li key={m}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-gray">{MODE_LABELS[m]}</span>
              <span className="font-semibold text-slate-gray">
                {hasAttempts ? `${metrics.accuracy}%` : "—"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${hasAttempts ? metrics.accuracy : 0}%`,
                  backgroundColor: MODE_BAR_COLORS[m],
                }}
              />
            </div>
            {hasAttempts && (
              <p className="mt-1 text-[11px] text-slate-gray/50">
                {metrics.correct}/{metrics.attempted} answers
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EngagementSignal({ summary }: { summary: StudentDetailResponse["summary"] }) {
  if (summary.attempted === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-gray">No data yet</p>
        <p className="mt-1 text-xs text-slate-gray/70">
          No attempts recorded for this student in the active filters.
        </p>
      </div>
    );
  }

  if (summary.isLowAndFast) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-700">
          <AlertTriangle className="h-4 w-4" />
          Clicking without engaging
        </p>
        <p className="mt-1 text-xs text-rose-700/80">
          Time per question ({formatDuration(summary.averageTimeSec)}) and accuracy ({summary.accuracy}%) suggest
          this student may be clicking through without engaging with the material.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-[#e8f5ec] p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        Engagement looks genuine
      </p>
      <p className="mt-1 text-xs text-emerald-700/80">
        Time per question ({formatDuration(summary.averageTimeSec)}) and accuracy ({summary.accuracy}%) are
        consistent with active engagement.
      </p>
    </div>
  );
}

function StandardsTab({
  data,
  isLoading,
  standardDetailQuery,
}: {
  data: StudentDetailResponse;
  isLoading: boolean;
  standardDetailQuery: URLSearchParams;
}) {
  return (
    <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
              <th className="px-5 py-3">Standard</th>
              <th className="px-3 py-3 text-center">Attempted</th>
              <th className="px-3 py-3 text-center">Correct</th>
              <th className="px-3 py-3">Accuracy</th>
              <th className="px-3 py-3 text-center">Avg time</th>
              <th className="px-5 py-3">Status</th>
              <th className="w-8 px-3 py-3" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {data.byStandard.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-gray/60">
                  {isLoading ? "Loading standards data..." : "No attempts recorded for this student yet."}
                </td>
              </tr>
            ) : (
              data.byStandard.map((row) => {
                const tone = BAND_TONES[row.status];
                const band = findStudentBand(row.status, data.thresholds);
                return (
                  <tr key={row.standardId} className="border-t border-slate-100 hover:bg-[#16a34a]/5">
                    <td className="px-5 py-3">
                      <Link
                        href={`/teacher-dashboard/standards/${encodeURIComponent(row.standardId)}?${standardDetailQuery.toString()}`}
                        className="font-medium text-slate-gray hover:text-[#166534] hover:underline"
                      >
                        {row.standardId}
                      </Link>
                      <p className="text-xs text-slate-gray/60 line-clamp-2 max-w-md">{row.standardLabel}</p>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-gray">{row.attempted}</td>
                    <td className="px-3 py-3 text-center text-slate-gray">{row.correct}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${row.accuracy}%` }} />
                        </div>
                        <span className={`text-sm font-semibold ${tone.text}`}>{row.accuracy}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center justify-center gap-1.5 text-slate-gray/70">
                        <Timer className="w-3.5 h-3.5 text-slate-gray/50" />
                        {row.averageTimeSec}s
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}>
                        {band.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-gray/40">
                      <Link href={`/teacher-dashboard/standards/${encodeURIComponent(row.standardId)}?${standardDetailQuery.toString()}`}>
                        <ChevronRight className="ml-auto h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuestionsTab({
  data,
  isLoading,
  standardDetailQuery,
}: {
  data: StudentDetailResponse;
  isLoading: boolean;
  standardDetailQuery: URLSearchParams;
}) {
  return (
    <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
              <th className="px-5 py-3">Question</th>
              <th className="w-32 px-3 py-3">Standard</th>
              <th className="w-24 px-3 py-3 text-center">Attempted</th>
              <th className="w-20 px-3 py-3 text-center">Correct</th>
              <th className="w-24 px-3 py-3 text-center">Accuracy</th>
              <th className="w-24 px-3 py-3 text-center">Avg time</th>
              <th className="w-28 px-3 py-3 text-center">Last attempt</th>
              <th className="w-8 px-3 py-3" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {data.byQuestion.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-gray/60">
                  {isLoading ? "Loading question data..." : "No attempts recorded for this student yet."}
                </td>
              </tr>
            ) : (
              data.byQuestion.map((row) => {
                const text = row.preview?.text ?? "Question text unavailable.";
                const truncated = text.length > 120 ? `${text.slice(0, 120)}…` : text;
                const href = row.standardId
                  ? `/teacher-dashboard/standards/${encodeURIComponent(row.standardId)}/questions/${encodeURIComponent(row.questionId)}?${standardDetailQuery.toString()}`
                  : null;
                return (
                  <tr key={row.questionId} className="border-t border-slate-100 hover:bg-[#16a34a]/5">
                    <td className="px-5 py-3 text-slate-gray">
                      {href ? (
                        <Link href={href} className="hover:text-[#166534] hover:underline">
                          <LatexText text={truncated} />
                        </Link>
                      ) : (
                        <LatexText text={truncated} />
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-gray/70">{row.standardId ?? "—"}</td>
                    <td className="px-3 py-3 text-center text-slate-gray">{row.attempted}</td>
                    <td className="px-3 py-3 text-center text-slate-gray">{row.correct}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-gray">{row.accuracy}%</td>
                    <td className="px-3 py-3 text-center text-slate-gray/70">{row.averageTimeSec}s</td>
                    <td className="px-3 py-3 text-center text-slate-gray/70">{formatChartDate(row.lastAttemptedAt.slice(0, 10))}</td>
                    <td className="px-3 py-3 text-right text-slate-gray/40">
                      {href && (
                        <Link href={href}>
                          <ChevronRight className="ml-auto h-4 w-4" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatChartDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}
