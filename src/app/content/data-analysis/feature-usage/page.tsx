"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DataAnalysisTabs } from "../tabs";

interface Counter {
  n: number;
  uniqueUsers: number;
}

interface FeatureUsageResponse {
  meta: {
    from: string;
    to: string;
    mode: string;
    totalEvents: number;
    truncated: boolean;
  };
  glossary: {
    bySource: Record<string, Counter>;
    topTerms: Array<{ termId: string; label: string; n: number; uniqueUsers: number }>;
  };
  tts: {
    byTarget: Record<string, Counter>;
  };
  confidence: {
    matrix: Record<string, Record<string, Counter>>;
  };
  explanation: {
    byPhase: Record<string, Counter>;
  };
  bookmarks: {
    added: Counter;
    removed: Counter;
  };
  hints: {
    opens: number;
    closes: number;
    dwellAvgMs: number | null;
    dwellMedianMs: number | null;
    sampleSize: number;
  };
}

function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const CONFIDENCE_LEVELS = ["sure", "somewhat", "not_sure"] as const;
const TTS_TARGETS = ["question", "choices", "feedback"] as const;
const GLOSSARY_SOURCES = ["inline", "modal", "sidebar"] as const;
const EXPLANATION_PHASES = ["completed", "retry", "exam_review"] as const;

const CONFIDENCE_LABELS: Record<string, string> = {
  sure: "Sure",
  somewhat: "Somewhat",
  not_sure: "Not sure",
};

export default function FeatureUsagePage() {
  const now = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const from = new Date(now);
    from.setDate(now.getDate() - 30);
    return from;
  }, [now]);

  const [from, setFrom] = useState(isoDateOnly(defaultFrom));
  const [to, setTo] = useState(isoDateOnly(now));
  const [mode, setMode] = useState("all");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FeatureUsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    if (mode !== "all") params.set("mode", mode);

    try {
      const response = await fetch(
        `/api/admin/analytics/feature-usage?${params.toString()}`,
        { cache: "no-store", credentials: "include" },
      );
      const payload = (await response.json()) as
        | FeatureUsageResponse
        | { error: string };
      if (!response.ok || "error" in payload) {
        setError(("error" in payload && payload.error) || "Failed to load feature usage.");
        setLoading(false);
        return;
      }
      setData(payload);
    } catch {
      setError("Network error while loading feature usage.");
    } finally {
      setLoading(false);
    }
  }, [from, mode, to]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Data Analysis
        </h1>
        <p className="text-slate-gray/70 max-w-3xl">
          Track which scaffolding features students actually use, broken down by source, target, and confidence.
        </p>
      </header>

      <DataAnalysisTabs active="feature-usage" />

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm mb-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="all">All modes</option>
              <option value="practice">Practice</option>
              <option value="exam">Exam</option>
              <option value="review">Review</option>
            </select>
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

      {data?.meta.truncated && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mb-4">
          Results are truncated at 50,000 events. Narrow the date range for a complete view.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-gray/70">Loading feature usage...</p>
      ) : data ? (
        <div className="space-y-6">
          <OverviewStrip data={data} />
          <GlossarySection data={data.glossary} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TtsSection data={data.tts} />
            <ExplanationSection data={data.explanation} />
          </div>
          <ConfidenceSection data={data.confidence} />
          <HintsSection data={data.hints} />
        </div>
      ) : (
        <p className="text-sm text-slate-gray/70">No feature usage events in the selected window.</p>
      )}
    </main>
  );
}

function OverviewStrip({ data }: { data: FeatureUsageResponse }) {
  const glossaryTotal = Object.values(data.glossary.bySource).reduce(
    (sum, counter) => sum + counter.n,
    0,
  );
  const ttsTotal = Object.values(data.tts.byTarget).reduce(
    (sum, counter) => sum + counter.n,
    0,
  );
  const confidenceTotal = Object.values(data.confidence.matrix).reduce(
    (sum, inner) =>
      sum + Object.values(inner).reduce((innerSum, counter) => innerSum + counter.n, 0),
    0,
  );
  const explanationTotal = Object.values(data.explanation.byPhase).reduce(
    (sum, counter) => sum + counter.n,
    0,
  );

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <MetricCard label="Glossary opens" value={glossaryTotal} />
      <MetricCard label="Read-aloud plays" value={ttsTotal} />
      <MetricCard label="Confidence ratings" value={confidenceTotal} />
      <MetricCard label="Feedback views" value={explanationTotal} />
      <MetricCard
        label="Bookmarks net"
        value={data.bookmarks.added.n - data.bookmarks.removed.n}
        hint={`+${data.bookmarks.added.n} / −${data.bookmarks.removed.n}`}
      />
    </section>
  );
}

function GlossarySection({ data }: { data: FeatureUsageResponse["glossary"] }) {
  const total = Object.values(data.bySource).reduce((sum, counter) => sum + counter.n, 0);
  const sources = GLOSSARY_SOURCES.filter((source) => data.bySource[source]);
  const extraSources = Object.keys(data.bySource).filter(
    (key) => !GLOSSARY_SOURCES.includes(key as (typeof GLOSSARY_SOURCES)[number]),
  );
  const allSources = [...sources, ...extraSources];

  return (
    <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#14532d] mb-3">Glossary usage</h2>
      {total === 0 ? (
        <p className="text-sm text-slate-gray/70">No glossary opens in this window.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 mb-5">
            {allSources.map((source) => (
              <CounterTile
                key={source}
                label={source.charAt(0).toUpperCase() + source.slice(1)}
                counter={data.bySource[source]}
                total={total}
              />
            ))}
          </div>

          <h3 className="text-sm font-semibold text-slate-gray mb-2">Top terms</h3>
          {data.topTerms.length === 0 ? (
            <p className="text-sm text-slate-gray/70">No term-level data.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.topTerms.map((term) => (
                <li
                  key={term.termId}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-slate-gray">{term.label}</span>
                  <span className="text-slate-gray/70 tabular-nums">
                    {term.n} opens
                    <span className="text-slate-gray/50"> · {term.uniqueUsers} users</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TtsSection({ data }: { data: FeatureUsageResponse["tts"] }) {
  const total = Object.values(data.byTarget).reduce((sum, counter) => sum + counter.n, 0);
  const targets = TTS_TARGETS.filter((target) => data.byTarget[target]);
  const extraTargets = Object.keys(data.byTarget).filter(
    (key) => !TTS_TARGETS.includes(key as (typeof TTS_TARGETS)[number]),
  );
  const allTargets = [...targets, ...extraTargets];

  return (
    <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#14532d] mb-3">Read-aloud (TTS)</h2>
      {total === 0 ? (
        <p className="text-sm text-slate-gray/70">No read-aloud plays in this window.</p>
      ) : (
        <div className="space-y-2">
          {allTargets.map((target) => (
            <BarRow
              key={target}
              label={target.charAt(0).toUpperCase() + target.slice(1)}
              counter={data.byTarget[target]}
              total={total}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ExplanationSection({ data }: { data: FeatureUsageResponse["explanation"] }) {
  const total = Object.values(data.byPhase).reduce((sum, counter) => sum + counter.n, 0);
  const phases = EXPLANATION_PHASES.filter((phase) => data.byPhase[phase]);
  const extraPhases = Object.keys(data.byPhase).filter(
    (key) => !EXPLANATION_PHASES.includes(key as (typeof EXPLANATION_PHASES)[number]),
  );
  const allPhases = [...phases, ...extraPhases];
  const phaseLabel: Record<string, string> = {
    completed: "Practice — final",
    retry: "Practice — after wrong attempt",
    exam_review: "Exam review",
  };

  return (
    <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#14532d] mb-3">Feedback (explanation) views</h2>
      {total === 0 ? (
        <p className="text-sm text-slate-gray/70">No feedback views in this window.</p>
      ) : (
        <div className="space-y-2">
          {allPhases.map((phase) => (
            <BarRow
              key={phase}
              label={phaseLabel[phase] ?? phase}
              counter={data.byPhase[phase]}
              total={total}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ConfidenceSection({ data }: { data: FeatureUsageResponse["confidence"] }) {
  const knownLevels = CONFIDENCE_LEVELS.filter((level) => data.matrix[level]);
  const extraLevels = Object.keys(data.matrix).filter(
    (key) => !CONFIDENCE_LEVELS.includes(key as (typeof CONFIDENCE_LEVELS)[number]),
  );
  const levels = [...knownLevels, ...extraLevels];
  const total = levels.reduce(
    (sum, level) =>
      sum +
      Object.values(data.matrix[level]).reduce((innerSum, counter) => innerSum + counter.n, 0),
    0,
  );

  return (
    <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#14532d] mb-3">Confidence × correctness</h2>
      {total === 0 ? (
        <p className="text-sm text-slate-gray/70">No confidence ratings in this window.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2 font-medium">Confidence</th>
                <th className="px-2 py-2 font-medium">Correct</th>
                <th className="px-2 py-2 font-medium">Incorrect</th>
                <th className="px-2 py-2 font-medium">Accuracy</th>
                <th className="px-2 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => {
                const row = data.matrix[level] ?? {};
                const correct = row.correct?.n ?? 0;
                const incorrect = row.incorrect?.n ?? 0;
                const rowTotal = correct + incorrect;
                const accuracy = rowTotal > 0 ? correct / rowTotal : 0;
                return (
                  <tr key={level} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-gray">
                      {CONFIDENCE_LABELS[level] ?? level}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{correct}</td>
                    <td className="px-2 py-2 tabular-nums">{incorrect}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {rowTotal > 0 ? `${Math.round(accuracy * 100)}%` : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-gray/60">
        Calibration: compare self-reported confidence with actual correctness. Well-calibrated students
        should be mostly correct when &quot;Sure&quot; and mostly incorrect when &quot;Not sure&quot;.
      </p>
    </section>
  );
}

function HintsSection({ data }: { data: FeatureUsageResponse["hints"] }) {
  const avgSec = data.dwellAvgMs !== null ? (data.dwellAvgMs / 1000).toFixed(1) : "—";
  const medianSec =
    data.dwellMedianMs !== null ? (data.dwellMedianMs / 1000).toFixed(1) : "—";
  return (
    <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#14532d] mb-3">Hints (scaffolding dwell)</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Hints shown" value={data.opens} />
        <MetricCard label="Hints closed" value={data.closes} />
        <MetricCard label="Avg dwell" value={`${avgSec}s`} hint={`n=${data.sampleSize}`} />
        <MetricCard label="Median dwell" value={`${medianSec}s`} />
      </div>
      <p className="mt-3 text-xs text-slate-gray/60">
        Dwell is measured from <code>hint_opened</code> to <code>hint_closed</code>. Closed includes correct
        answer, max attempts reached, and moving to the next question.
      </p>
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-gray/60">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-gray">{value}</p>
      {hint && <p className="text-xs text-slate-gray/60 mt-0.5">{hint}</p>}
    </article>
  );
}

function CounterTile({
  label,
  counter,
  total,
}: {
  label: string;
  counter: Counter;
  total: number;
}) {
  const pct = total > 0 ? Math.round((counter.n / total) * 100) : 0;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-gray/60">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-gray tabular-nums">
        {counter.n}
        <span className="ml-2 text-xs text-slate-gray/60 font-normal">{pct}%</span>
      </p>
      <p className="text-xs text-slate-gray/60">{counter.uniqueUsers} users</p>
    </article>
  );
}

function BarRow({
  label,
  counter,
  total,
}: {
  label: string;
  counter: Counter | undefined;
  total: number;
}) {
  const n = counter?.n ?? 0;
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-gray">{label}</span>
        <span className="text-slate-gray/70 tabular-nums">
          {n}
          <span className="text-slate-gray/50"> · {pct}%</span>
          {counter && (
            <span className="text-slate-gray/50"> · {counter.uniqueUsers} users</span>
          )}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-[#16a34a]/70"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}
