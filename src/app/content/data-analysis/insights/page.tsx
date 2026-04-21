"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DataAnalysisTabs } from "../tabs";

interface Counter {
  started: number;
  completed: number;
  abandoned: number;
  completionRate: number;
  avgSessionMin: number | null;
  medianSessionMin: number | null;
  sessions: number;
}

interface InsightsResponse {
  meta: {
    from: string;
    to: string;
    practiceGroups: number;
    examGroups: number;
    reviewDwellPairs: number;
    stageUserModes: number;
    sessionDurations: number;
  };
  scaffolding: {
    overall: {
      firstAttemptAccuracy: number;
      finalAccuracy: number;
      uplift: number;
      worked: number;
      failed: number;
      firstTryRight: number;
      cohortSize: number;
    };
    byStandard: Array<{
      standardId: string;
      standardLabel: string;
      firstAttemptAccuracy: number;
      finalAccuracy: number;
      uplift: number;
      worked: number;
      failed: number;
      cohortSize: number;
    }>;
    byStudent: Array<{
      userId: string;
      displayName: string;
      firstAttemptAccuracy: number;
      finalAccuracy: number;
      uplift: number;
      worked: number;
      failed: number;
      cohortSize: number;
    }>;
  };
  practiceVsExam: {
    overall: {
      practiceAccuracy: number;
      examAccuracy: number;
      gap: number;
      practiceN: number;
      examN: number;
    };
    byStandard: Array<{
      standardId: string;
      standardLabel: string;
      practiceAccuracy: number;
      examAccuracy: number;
      gap: number;
      practiceN: number;
      examN: number;
    }>;
    byStudent: Array<{
      userId: string;
      displayName: string;
      practiceAccuracy: number;
      examAccuracy: number;
      gap: number;
      practiceN: number;
      examN: number;
    }>;
  };
  reviewRouting: {
    overall: {
      studentsWithErrors: number;
      errorThreshold: number;
      studentsEnteredReview: number;
      strugglersInReview: number;
      strugglersNoReview: number;
      avgReviewMinutes: number | null;
      medianReviewMinutes: number | null;
    };
    scatter: Array<{
      userId: string;
      displayName: string;
      practiceErrors: number;
      reviewMinutes: number;
      enteredReview: boolean;
    }>;
    strugglersNoReview: Array<{
      userId: string;
      displayName: string;
      practiceErrors: number;
      reviewMinutes: number;
      enteredReview: boolean;
    }>;
  };
  completion: {
    overall: {
      started: number;
      completed: number;
      abandoned: number;
      completionRate: number;
    };
    byMode: Record<string, Counter>;
    byStudent: Array<{
      userId: string;
      displayName: string;
      started: number;
      completed: number;
      abandoned: number;
      completionRate: number;
    }>;
  };
}

function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function pctSigned(value: number): string {
  const v = Math.round(value * 100);
  return `${v >= 0 ? "+" : ""}${v}pp`;
}

function fmtMinutes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return `${Math.round(value * 60)}s`;
  return `${value.toFixed(1)}m`;
}

export default function InsightsPage() {
  const now = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const from = new Date(now);
    from.setDate(now.getDate() - 30);
    return from;
  }, [now]);

  const [from, setFrom] = useState(isoDateOnly(defaultFrom));
  const [to, setTo] = useState(isoDateOnly(now));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });

    try {
      const response = await fetch(
        `/api/admin/analytics/insights?${params.toString()}`,
        { cache: "no-store", credentials: "include" },
      );
      const payload = (await response.json()) as InsightsResponse | { error: string };
      if (!response.ok || "error" in payload) {
        setError(("error" in payload && payload.error) || "Failed to load insights.");
        setLoading(false);
        return;
      }
      setData(payload);
    } catch {
      setError("Network error while loading insights.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Data Analysis — Insights
        </h1>
        <p className="text-slate-gray/70 max-w-3xl">
          Headline metrics for scaffolding effectiveness, practice vs exam understanding, review
          routing, and completion. Drill down via the Questions or Student attempts tab for row-level data.
        </p>
      </header>

      <DataAnalysisTabs active="insights" />

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm mb-6">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">From</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">To</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={() => void fetchData()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-gray/70">Loading insights...</p>
      ) : data ? (
        <div className="space-y-8">
          <ScaffoldingSection data={data.scaffolding} />
          <PracticeVsExamSection data={data.practiceVsExam} />
          <ReviewRoutingSection data={data.reviewRouting} />
          <CompletionSection data={data.completion} />
        </div>
      ) : (
        <p className="text-sm text-slate-gray/70">No data for the selected window.</p>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Q2 — Scaffolding effectiveness
// ---------------------------------------------------------------------------

function ScaffoldingSection({ data }: { data: InsightsResponse["scaffolding"] }) {
  const { overall } = data;
  const totalWrongFirst = overall.worked + overall.failed;
  const recoveryRate = totalWrongFirst > 0 ? overall.worked / totalWrongFirst : 0;

  return (
    <QuestionSection
      title="Does scaffolding actually correct errors?"
      leadAnswer={
        <LeadAnswer
          metric={pctSigned(overall.uplift)}
          label="accuracy uplift from first → final attempt (Practice)"
          sublabel={`${overall.cohortSize} practice items · ${pct(overall.firstAttemptAccuracy)} → ${pct(overall.finalAccuracy)}`}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <MetricCard
          label="First try correct"
          value={overall.firstTryRight.toLocaleString()}
          hint="Scaffolding never shown"
          tone="neutral"
        />
        <MetricCard
          label="Scaffolding rescued"
          value={overall.worked.toLocaleString()}
          hint={`${pct(recoveryRate)} of wrong-first attempts`}
          tone="good"
        />
        <MetricCard
          label="Still wrong after scaffolding"
          value={overall.failed.toLocaleString()}
          hint={`${pct(1 - recoveryRate)} of wrong-first attempts`}
          tone="warn"
        />
      </div>

      <SubsectionHeader
        title="By standard"
        subtitle="Standards with the smallest uplift are candidates for scaffolding redesign."
      />
      {data.byStandard.length === 0 ? (
        <EmptyHint text="Not enough data per standard yet." />
      ) : (
        <Table
          headers={["Standard", "n", "First", "Final", "Uplift", "Still wrong"]}
          rows={data.byStandard.slice(0, 15).map((row) => [
            <span key="label" className="font-medium text-slate-gray">
              {row.standardLabel}
            </span>,
            <NumCell key="n" value={row.cohortSize} />,
            <NumCell key="first" value={pct(row.firstAttemptAccuracy)} />,
            <NumCell key="final" value={pct(row.finalAccuracy)} />,
            <UpliftCell key="uplift" value={row.uplift} />,
            <NumCell key="failed" value={row.failed} />,
          ])}
        />
      )}

      <SubsectionHeader title="By student (most wrong-after-scaffolding first)" />
      {data.byStudent.length === 0 ? (
        <EmptyHint text="No student-level data yet." />
      ) : (
        <Table
          headers={["Student", "n", "First", "Final", "Uplift", "Still wrong"]}
          rows={data.byStudent.slice(0, 15).map((row) => [
            <span key="label" className="font-medium text-slate-gray">
              {row.displayName}
            </span>,
            <NumCell key="n" value={row.cohortSize} />,
            <NumCell key="first" value={pct(row.firstAttemptAccuracy)} />,
            <NumCell key="final" value={pct(row.finalAccuracy)} />,
            <UpliftCell key="uplift" value={row.uplift} />,
            <NumCell key="failed" value={row.failed} />,
          ])}
        />
      )}
    </QuestionSection>
  );
}

// ---------------------------------------------------------------------------
// Q3 — Practice vs Exam understanding
// ---------------------------------------------------------------------------

function PracticeVsExamSection({ data }: { data: InsightsResponse["practiceVsExam"] }) {
  const { overall } = data;
  return (
    <QuestionSection
      title="Do students understand or rely on scaffolding?"
      leadAnswer={
        <LeadAnswer
          metric={pctSigned(overall.gap)}
          label="practice − exam accuracy gap"
          sublabel={`Practice ${pct(overall.practiceAccuracy)} (n=${overall.practiceN}) · Exam ${pct(overall.examAccuracy)} (n=${overall.examN})`}
          tone={overall.gap > 0.25 ? "warn" : overall.gap > 0.1 ? "neutral" : "good"}
        />
      }
    >
      <p className="text-sm text-slate-gray/70 mb-4">
        A large positive gap suggests students can solve the standard in Practice (with scaffolding)
        but not in Exam (no scaffolding) — i.e. they rely on scaffolding rather than understanding.
      </p>

      <SubsectionHeader title="By standard (largest gap first = most scaffolding-dependent)" />
      {data.byStandard.length === 0 ? (
        <EmptyHint text="Need at least 3 attempts in both Practice and Exam per standard." />
      ) : (
        <Table
          headers={["Standard", "Practice", "Exam", "Gap", "nP", "nE"]}
          rows={data.byStandard.slice(0, 15).map((row) => [
            <span key="label" className="font-medium text-slate-gray">
              {row.standardLabel}
            </span>,
            <NumCell key="p" value={pct(row.practiceAccuracy)} />,
            <NumCell key="e" value={pct(row.examAccuracy)} />,
            <GapCell key="gap" value={row.gap} />,
            <NumCell key="np" value={row.practiceN} />,
            <NumCell key="ne" value={row.examN} />,
          ])}
        />
      )}

      <SubsectionHeader title="By student" />
      {data.byStudent.length === 0 ? (
        <EmptyHint text="No student has attempted enough questions in both modes yet." />
      ) : (
        <Table
          headers={["Student", "Practice", "Exam", "Gap", "nP", "nE"]}
          rows={data.byStudent.slice(0, 15).map((row) => [
            <span key="label" className="font-medium text-slate-gray">
              {row.displayName}
            </span>,
            <NumCell key="p" value={pct(row.practiceAccuracy)} />,
            <NumCell key="e" value={pct(row.examAccuracy)} />,
            <GapCell key="gap" value={row.gap} />,
            <NumCell key="np" value={row.practiceN} />,
            <NumCell key="ne" value={row.examN} />,
          ])}
        />
      )}
    </QuestionSection>
  );
}

// ---------------------------------------------------------------------------
// Q4 — Review routing
// ---------------------------------------------------------------------------

function ReviewRoutingSection({ data }: { data: InsightsResponse["reviewRouting"] }) {
  const { overall } = data;
  const routingRate =
    overall.studentsWithErrors > 0
      ? overall.strugglersInReview / overall.studentsWithErrors
      : 0;
  return (
    <QuestionSection
      title="Is review mode routing the struggling students?"
      leadAnswer={
        <LeadAnswer
          metric={pct(routingRate)}
          label={`of struggling students (≥${overall.errorThreshold} errors) entered review mode`}
          sublabel={`${overall.strugglersInReview}/${overall.studentsWithErrors} routed · ${overall.strugglersNoReview} missed`}
          tone={routingRate < 0.5 ? "warn" : routingRate < 0.8 ? "neutral" : "good"}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-4 mb-5">
        <MetricCard
          label="Struggling students"
          value={overall.studentsWithErrors.toLocaleString()}
          hint={`≥${overall.errorThreshold} wrong-after-scaffolding`}
          tone="neutral"
        />
        <MetricCard
          label="Entered review"
          value={overall.studentsEnteredReview.toLocaleString()}
          hint="any user with review activity"
          tone="neutral"
        />
        <MetricCard
          label="Avg review time"
          value={fmtMinutes(overall.avgReviewMinutes)}
          hint={`median ${fmtMinutes(overall.medianReviewMinutes)}`}
          tone="neutral"
        />
        <MetricCard
          label="Missed routing"
          value={overall.strugglersNoReview.toLocaleString()}
          hint="errors but no review"
          tone={overall.strugglersNoReview > 0 ? "warn" : "good"}
        />
      </div>

      <SubsectionHeader
        title="Students with errors but no review"
        subtitle="If this list is non-trivial, the system is not routing struggling students into review."
      />
      {data.strugglersNoReview.length === 0 ? (
        <EmptyHint text="Every struggling student entered review at least once. Routing is working." />
      ) : (
        <Table
          headers={["Student", "Practice errors", "Review minutes"]}
          rows={data.strugglersNoReview.slice(0, 20).map((row) => [
            <span key="label" className="font-medium text-slate-gray">
              {row.displayName}
            </span>,
            <NumCell key="err" value={row.practiceErrors} />,
            <NumCell key="rev" value={fmtMinutes(row.reviewMinutes)} />,
          ])}
        />
      )}

      <SubsectionHeader
        title="All students (practice errors vs review time)"
        subtitle="Students further to the right but low on the review axis are the concerning pattern."
      />
      <Scatter points={data.scatter} />
    </QuestionSection>
  );
}

// ---------------------------------------------------------------------------
// Q5 — Completion / drop-off / time on task
// ---------------------------------------------------------------------------

function CompletionSection({ data }: { data: InsightsResponse["completion"] }) {
  const { overall, byMode } = data;
  const modeEntries = Object.entries(byMode);
  return (
    <QuestionSection
      title="Completion rate, drop-off, and time on task"
      leadAnswer={
        <LeadAnswer
          metric={pct(overall.completionRate)}
          label="of stages were completed"
          sublabel={`${overall.completed.toLocaleString()} completed / ${overall.started.toLocaleString()} started · ${overall.abandoned.toLocaleString()} abandoned`}
          tone={
            overall.completionRate < 0.6
              ? "warn"
              : overall.completionRate < 0.85
                ? "neutral"
                : "good"
          }
        />
      }
    >
      <SubsectionHeader title="By mode" />
      {modeEntries.length === 0 ? (
        <EmptyHint text="No stage events in this window." />
      ) : (
        <Table
          headers={["Mode", "Started", "Completed", "Abandoned", "Completion", "Avg", "Median"]}
          rows={modeEntries.map(([mode, counter]) => [
            <span key="label" className="font-medium text-slate-gray capitalize">
              {mode}
            </span>,
            <NumCell key="s" value={counter.started} />,
            <NumCell key="c" value={counter.completed} />,
            <NumCell key="a" value={counter.abandoned} />,
            <NumCell key="rate" value={pct(counter.completionRate)} />,
            <NumCell key="avg" value={fmtMinutes(counter.avgSessionMin)} />,
            <NumCell key="med" value={fmtMinutes(counter.medianSessionMin)} />,
          ])}
        />
      )}

      <SubsectionHeader
        title="By student (lowest completion first)"
        subtitle="Students repeatedly starting without completing suggest drop-off risk."
      />
      {data.byStudent.length === 0 ? (
        <EmptyHint text="Need at least 2 started stages per student for this list." />
      ) : (
        <Table
          headers={["Student", "Started", "Completed", "Abandoned", "Completion"]}
          rows={data.byStudent.slice(0, 15).map((row) => [
            <span key="label" className="font-medium text-slate-gray">
              {row.displayName}
            </span>,
            <NumCell key="s" value={row.started} />,
            <NumCell key="c" value={row.completed} />,
            <NumCell key="a" value={row.abandoned} />,
            <NumCell key="rate" value={pct(row.completionRate)} />,
          ])}
        />
      )}
    </QuestionSection>
  );
}

// ---------------------------------------------------------------------------
// Shared layout primitives
// ---------------------------------------------------------------------------

function QuestionSection({
  title,
  leadAnswer,
  children,
}: {
  title: string;
  leadAnswer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="text-xl font-semibold text-[#14532d]">{title}</h2>
      </header>
      <div className="mb-5">{leadAnswer}</div>
      {children}
    </section>
  );
}

function LeadAnswer({
  metric,
  label,
  sublabel,
  tone = "neutral",
}: {
  metric: string;
  label: string;
  sublabel?: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-[#16a34a]"
      : tone === "warn"
        ? "text-amber-600"
        : "text-[#14532d]";
  return (
    <div className="rounded-xl bg-[#f0fdf4] border border-[#16a34a]/20 px-4 py-3">
      <p className={`text-3xl sm:text-4xl font-bold tabular-nums ${toneClass}`}>{metric}</p>
      <p className="text-sm text-slate-gray mt-1">{label}</p>
      {sublabel && <p className="text-xs text-slate-gray/70 mt-1">{sublabel}</p>}
    </div>
  );
}

function SubsectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mt-5 mb-2">
      <h3 className="text-sm font-semibold text-slate-gray">{title}</h3>
      {subtitle && <p className="text-xs text-slate-gray/60 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm text-slate-gray/60 italic">{text}</p>;
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const ring =
    tone === "good"
      ? "border-[#16a34a]/30 bg-[#f0fdf4]"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";
  return (
    <article className={`rounded-xl border ${ring} p-4 shadow-sm`}>
      <p className="text-xs uppercase tracking-wide text-slate-gray/70">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-gray tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-gray/60 mt-0.5">{hint}</p>}
    </article>
  );
}

function NumCell({ value }: { value: string | number }) {
  return <span className="tabular-nums text-slate-gray/90">{value}</span>;
}

function UpliftCell({ value }: { value: number }) {
  const tone = value > 0.1 ? "text-[#16a34a]" : value < 0 ? "text-red-600" : "text-slate-gray/70";
  return <span className={`tabular-nums font-medium ${tone}`}>{pctSigned(value)}</span>;
}

function GapCell({ value }: { value: number }) {
  const tone =
    value > 0.25 ? "text-amber-700" : value > 0.1 ? "text-slate-gray" : "text-[#16a34a]";
  return <span className={`tabular-nums font-medium ${tone}`}>{pctSigned(value)}</span>;
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Scatter({
  points,
}: {
  points: Array<{
    userId: string;
    displayName: string;
    practiceErrors: number;
    reviewMinutes: number;
    enteredReview: boolean;
  }>;
}) {
  const maxErrors = Math.max(1, ...points.map((p) => p.practiceErrors));
  const maxMinutes = Math.max(1, ...points.map((p) => p.reviewMinutes));

  if (points.length === 0) {
    return <EmptyHint text="No scatter data in this window." />;
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div
        className="relative"
        style={{ height: "260px" }}
        aria-label="Scatter plot: practice errors vs review minutes"
      >
        {/* Axes */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-300" />
        <div className="absolute bottom-0 top-0 left-0 w-px bg-slate-300" />
        <span className="absolute -left-1 top-0 text-[10px] text-slate-gray/70">
          {fmtMinutes(maxMinutes)}
        </span>
        <span className="absolute -left-1 bottom-2 text-[10px] text-slate-gray/70">0</span>
        <span className="absolute right-0 -bottom-4 text-[10px] text-slate-gray/70">
          {maxErrors} errors
        </span>
        <span className="absolute left-1 -bottom-4 text-[10px] text-slate-gray/70">0</span>
        {points.map((p) => {
          const x = (p.practiceErrors / maxErrors) * 100;
          const y = (p.reviewMinutes / maxMinutes) * 100;
          const tone = p.enteredReview ? "bg-[#16a34a]" : "bg-red-500";
          return (
            <div
              key={p.userId}
              title={`${p.displayName} · ${p.practiceErrors} errors · ${fmtMinutes(p.reviewMinutes)}`}
              className={`absolute rounded-full ${tone}`}
              style={{
                left: `calc(${x}% - 4px)`,
                bottom: `calc(${y}% - 4px)`,
                width: "8px",
                height: "8px",
                opacity: 0.75,
              }}
            />
          );
        })}
      </div>
      <div className="mt-6 flex items-center gap-4 text-xs text-slate-gray/70">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#16a34a]" />
          Entered review
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          Did not enter
        </span>
        <span className="text-slate-gray/50">X: practice errors · Y: review minutes</span>
      </div>
    </div>
  );
}
