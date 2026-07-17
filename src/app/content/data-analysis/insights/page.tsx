"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { DateRangePicker, defaultPilotRange } from "../date-range";
import { SchoolFilter } from "../school-filter";
import {
  buttonOutlinePrimary,
  metricCardGood,
  metricCardNeutral,
  metricCardWarn,
  textAmber,
} from "@/lib/ui/status-badge-styles";

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
  hintDependency: {
    hintShownN: number;
    hintRecoveryRate: number | null;
    noHintN: number;
    noHintAccuracy: number | null;
    hintDependencyIndex: number | null;
    hintShownAndRecovered: number;
    hintShownAndFailed: number;
    noHintCorrect: number;
  };
  confidenceCalibration: {
    total: number;
    matrix: Record<string, { correct: number; incorrect: number }>;
    overconfidentWrong: number;
    underconfidentRight: number;
    calibratedRate: number | null;
  };
}

function pct(value: number | null): string {
  if (value === null) return "—";
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
  const initialRange = useMemo(() => defaultPilotRange(), []);
  const [range, setRange] = useState(initialRange);
  const { from, to } = range;
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    if (schoolIds.length > 0) params.set("schoolIds", schoolIds.join(","));

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
  }, [from, to, schoolIds]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <>

      <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-5 sm:p-6 shadow-[var(--assignment-card-shadow)] mb-6">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="mt-4 max-w-xl">
          <SchoolFilter value={schoolIds} onChange={setSchoolIds} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-2 rounded-full font-heading font-bold px-5 py-2 text-sm transition duration-200 hover:brightness-110 active:brightness-95 border-[1.5px] border-[var(--assignment-glass-border)] bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)] shadow-[var(--assignment-cta-elevated-shadow)]"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => data && downloadInsightsCsv(data, range)}
            disabled={!data}
            className={buttonOutlinePrimary}
          >
            <Download className="w-4 h-4" />
            Download summary CSV
          </button>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading insights...</p>
      ) : data ? (
        <div className="space-y-8">
          <ScaffoldingSection data={data.scaffolding} />
          <HintDependencySection data={data.hintDependency} />
          <PracticeVsExamSection data={data.practiceVsExam} />
          <ConfidenceCalibrationSection data={data.confidenceCalibration} />
          <ReviewRoutingSection data={data.reviewRouting} />
          <CompletionSection data={data.completion} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No data for the selected window.</p>
      )}
    </>
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
      <p className="text-sm text-muted-foreground mb-4">
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
    <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-5 sm:p-6 shadow-[var(--assignment-card-shadow)]">
      <header className="mb-4">
        <h2 className="font-heading text-xl font-semibold text-heading tracking-[-0.4px]">{title}</h2>
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
      ? "text-primary"
      : tone === "warn"
        ? "text-amber-600"
        : "text-heading";
  return (
    <div className="rounded-2xl border border-[var(--assignment-panel-border)] bg-[var(--assignment-glass-bg)] px-4 py-3">
      <p className={`text-3xl sm:text-4xl font-bold tabular-nums ${toneClass}`}>{metric}</p>
      <p className="text-sm text-slate-gray mt-1">{label}</p>
      {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
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
      <h3 className="font-heading text-sm font-semibold text-slate-gray tracking-[-0.2px]">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground italic">{text}</p>;
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
      ? metricCardGood
      : tone === "warn"
        ? metricCardWarn
        : metricCardNeutral;
  return (
    <article className={`rounded-xl border ${ring} p-4`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-gray tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </article>
  );
}

function NumCell({ value }: { value: string | number }) {
  return <span className="tabular-nums text-slate-gray/90">{value}</span>;
}

function UpliftCell({ value }: { value: number }) {
  const tone = value > 0.1 ? "text-primary" : value < 0 ? "text-error" : "text-muted-foreground";
  return <span className={`tabular-nums font-medium ${tone}`}>{pctSigned(value)}</span>;
}

function GapCell({ value }: { value: number }) {
  const tone =
    value > 0.25 ? textAmber : value > 0.1 ? "text-slate-gray" : "text-primary";
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
          <tr className="border-b border-border-default text-left text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border-subtle">
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

// ---------------------------------------------------------------------------
// Hint Dependency Index
// ---------------------------------------------------------------------------

function HintDependencySection({
  data,
}: {
  data: InsightsResponse["hintDependency"];
}) {
  return (
    <QuestionSection
      title="Is the scaffolding a useful nudge or a crutch?"
      leadAnswer={
        <LeadAnswer
          metric={
            data.hintRecoveryRate !== null
              ? pct(data.hintRecoveryRate)
              : "—"
          }
          label="of wrong-first answers recover after the hint is shown"
          sublabel={`No-hint accuracy ${pct(data.noHintAccuracy)} (n=${data.noHintN}) · Hint shown n=${data.hintShownN} · Recovered ${data.hintShownAndRecovered} / Failed ${data.hintShownAndFailed}`}
          tone={
            data.hintRecoveryRate === null
              ? "neutral"
              : data.hintRecoveryRate > 0.8
                ? "warn"
                : data.hintRecoveryRate > 0.4
                  ? "good"
                  : "warn"
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <MetricCard
          label="Hint recovery rate"
          value={pct(data.hintRecoveryRate)}
          hint={`n=${data.hintShownAndRecovered + data.hintShownAndFailed}`}
          tone="neutral"
        />
        <MetricCard
          label="No-hint accuracy"
          value={pct(data.noHintAccuracy)}
          hint={`n=${data.noHintN}`}
          tone="neutral"
        />
        <MetricCard
          label="Dependency index"
          value={
            data.hintDependencyIndex !== null
              ? data.hintDependencyIndex.toFixed(2)
              : "—"
          }
          hint="recovery ÷ no-hint accuracy"
          tone="neutral"
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Dependency index near 1 means the scaffolding lifts students to about
        the same level as those who didn&apos;t need it — a useful nudge.
        Significantly above 1 means the hint is doing most of the work, which
        is a red flag for over-scaffolding. Significantly below 1 means the
        hint isn&apos;t recovering answers as well as baseline, a sign of
        scaffolding that is too vague or too late.
      </p>
    </QuestionSection>
  );
}

// ---------------------------------------------------------------------------
// Confidence × Correctness calibration
// ---------------------------------------------------------------------------

function ConfidenceCalibrationSection({
  data,
}: {
  data: InsightsResponse["confidenceCalibration"];
}) {
  const order = ["sure", "somewhat", "not_sure"] as const;
  const labels: Record<string, string> = {
    sure: "Sure",
    somewhat: "Somewhat",
    not_sure: "Not sure",
  };
  const rows = order
    .map((level) => ({
      level,
      row: data.matrix[level] ?? { correct: 0, incorrect: 0 },
    }))
    .filter(({ row }) => row.correct + row.incorrect > 0);

  return (
    <QuestionSection
      title="Are students' self-assessments accurate?"
      leadAnswer={
        <LeadAnswer
          metric={pct(data.calibratedRate)}
          label="of confidence ratings were well-calibrated"
          sublabel={`Overconfident-wrong ${data.overconfidentWrong} · Underconfident-right ${data.underconfidentRight} · n=${data.total}`}
          tone={
            data.calibratedRate === null
              ? "neutral"
              : data.calibratedRate > 0.7
                ? "good"
                : data.calibratedRate > 0.5
                  ? "neutral"
                  : "warn"
          }
        />
      }
    >
      {data.total === 0 ? (
        <EmptyHint text="No confidence ratings submitted in this window." />
      ) : (
        <Table
          headers={["Confidence", "Correct", "Incorrect", "Accuracy", "n"]}
          rows={rows.map(({ level, row }) => {
            const n = row.correct + row.incorrect;
            const accuracy = n > 0 ? row.correct / n : 0;
            return [
              <span key="l" className="font-medium text-slate-gray">
                {labels[level] ?? level}
              </span>,
              <NumCell key="c" value={row.correct} />,
              <NumCell key="i" value={row.incorrect} />,
              <NumCell key="a" value={pct(accuracy)} />,
              <NumCell key="n" value={n} />,
            ];
          })}
        />
      )}
      <p className="text-xs text-muted-foreground leading-relaxed mt-3">
        A calibrated learner is mostly correct when they rate themselves &quot;Sure&quot;
        and more often wrong when &quot;Not sure&quot;. Overconfident-wrong is the
        dangerous quadrant — it points to misconceptions the learner doesn&apos;t
        know they have.
      </p>
    </QuestionSection>
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
    <div className="mt-2 rounded-xl border border-border-default bg-surface-muted/50 p-4">
      <div
        className="relative"
        style={{ height: "260px" }}
        aria-label="Scatter plot: practice errors vs review minutes"
      >
        {/* Axes */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-[var(--border-default)]" />
        <div className="absolute bottom-0 top-0 left-0 w-px bg-[var(--border-default)]" />
        <span className="absolute -left-1 top-0 text-[10px] text-muted-foreground">
          {fmtMinutes(maxMinutes)}
        </span>
        <span className="absolute -left-1 bottom-2 text-[10px] text-muted-foreground">0</span>
        <span className="absolute right-0 -bottom-4 text-[10px] text-muted-foreground">
          {maxErrors} errors
        </span>
        <span className="absolute left-1 -bottom-4 text-[10px] text-muted-foreground">0</span>
        {points.map((p) => {
          const x = (p.practiceErrors / maxErrors) * 100;
          const y = (p.reviewMinutes / maxMinutes) * 100;
          const tone = p.enteredReview ? "bg-[var(--assignment-completed)]" : "bg-error-light0";
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
      <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--assignment-completed)]" />
          Entered review
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-error-light0" />
          Did not enter
        </span>
        <span className="text-muted-foreground">X: practice errors · Y: review minutes</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary CSV export (client-side)
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadInsightsCsv(
  data: InsightsResponse,
  range: { from: string; to: string },
) {
  const lines: string[] = [];
  lines.push(`# Insights summary export`);
  lines.push(`# from=${range.from} to=${range.to}`);
  lines.push("");
  lines.push("section,metric,value,denominator,notes");
  lines.push(
    `scaffolding,first_attempt_accuracy,${data.scaffolding.overall.firstAttemptAccuracy},${data.scaffolding.overall.cohortSize},${csvCell("Practice first-try accuracy")}`,
  );
  lines.push(
    `scaffolding,final_accuracy,${data.scaffolding.overall.finalAccuracy},${data.scaffolding.overall.cohortSize},${csvCell("Practice final-attempt accuracy")}`,
  );
  lines.push(
    `scaffolding,uplift_pp,${data.scaffolding.overall.uplift},${data.scaffolding.overall.cohortSize},${csvCell("final − first")}`,
  );
  lines.push(
    `practice_vs_exam,gap_pp,${data.practiceVsExam.overall.gap},${data.practiceVsExam.overall.practiceN + data.practiceVsExam.overall.examN},${csvCell("practice − exam accuracy")}`,
  );
  lines.push(
    `practice_vs_exam,practice_accuracy,${data.practiceVsExam.overall.practiceAccuracy},${data.practiceVsExam.overall.practiceN},`,
  );
  lines.push(
    `practice_vs_exam,exam_accuracy,${data.practiceVsExam.overall.examAccuracy},${data.practiceVsExam.overall.examN},`,
  );
  lines.push(
    `review_routing,strugglers,${data.reviewRouting.overall.studentsWithErrors},,${csvCell("≥" + data.reviewRouting.overall.errorThreshold + " practice errors")}`,
  );
  lines.push(
    `review_routing,strugglers_in_review,${data.reviewRouting.overall.strugglersInReview},${data.reviewRouting.overall.studentsWithErrors},`,
  );
  lines.push(
    `review_routing,strugglers_missed,${data.reviewRouting.overall.strugglersNoReview},${data.reviewRouting.overall.studentsWithErrors},`,
  );
  lines.push(
    `completion,rate,${data.completion.overall.completionRate},${data.completion.overall.started},${csvCell("stage completed / started")}`,
  );
  lines.push(
    `completion,started,${data.completion.overall.started},,`,
  );
  lines.push(
    `completion,completed,${data.completion.overall.completed},,`,
  );
  lines.push(
    `completion,abandoned,${data.completion.overall.abandoned},,`,
  );
  lines.push(
    `hint_dependency,hint_recovery_rate,${data.hintDependency.hintRecoveryRate ?? ""},${data.hintDependency.hintShownAndRecovered + data.hintDependency.hintShownAndFailed},${csvCell("hint shown → ended correct")}`,
  );
  lines.push(
    `hint_dependency,no_hint_accuracy,${data.hintDependency.noHintAccuracy ?? ""},${data.hintDependency.noHintN},`,
  );
  lines.push(
    `hint_dependency,dependency_index,${data.hintDependency.hintDependencyIndex ?? ""},,${csvCell("recovery / no-hint accuracy")}`,
  );
  lines.push(
    `confidence,calibrated_rate,${data.confidenceCalibration.calibratedRate ?? ""},${data.confidenceCalibration.total},`,
  );
  lines.push(
    `confidence,overconfident_wrong,${data.confidenceCalibration.overconfidentWrong},${data.confidenceCalibration.total},${csvCell("sure + incorrect")}`,
  );
  lines.push(
    `confidence,underconfident_right,${data.confidenceCalibration.underconfidentRight},${data.confidenceCalibration.total},${csvCell("not_sure + correct")}`,
  );

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `insights-summary_${range.from}_${range.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
