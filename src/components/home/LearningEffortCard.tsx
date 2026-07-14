"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTimeSpent } from "@/lib/format-time";
import type { EffortSeries, LearningEffort } from "@/lib/homepage/learning-effort";

type Range = "weekly" | "monthly";

const CARD_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-card-shadow)",
} as const;

function EffortTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; seconds: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const { label, seconds } = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-popover-shadow)",
      }}
    >
      <p className="font-semibold text-slate-gray">{label}</p>
      <p className="mt-0.5 text-muted-foreground">{formatTimeSpent(seconds)}</p>
    </div>
  );
}

function DeltaLine({ series, range }: { series: EffortSeries; range: Range }) {
  if (series.deltaPercent === null) return null;
  const period = range === "weekly" ? "last week" : "last month";
  const direction = series.deltaPercent >= 0 ? "more" : "less";
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {Math.abs(series.deltaPercent)}% {direction} than {period}
    </p>
  );
}

function RangeToggle({
  range,
  onChange,
}: {
  range: Range;
  onChange: (range: Range) => void;
}) {
  return (
    <div
      className="flex items-center rounded-full p-1"
      style={{ background: "var(--assignment-row-cta-bg)" }}
      role="group"
      aria-label="Learning effort range"
    >
      {(["weekly", "monthly"] as const).map((value) => {
        const isActive = value === range;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(value)}
            className="rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            style={
              isActive
                ? {
                    background: "var(--surface)",
                    color: "var(--foreground)",
                    boxShadow: "var(--assignment-row-cta-shadow)",
                  }
                : { color: "var(--muted-foreground)" }
            }
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bar chart of practice time from `analytics_sessions`. Both ranges arrive
 * with the server render, so the toggle is pure client state. `effort` is
 * null only when the sessions query failed — all-zero data from a successful
 * query renders the empty message instead of a chart of empty bars.
 */
export function LearningEffortCard({ effort }: { effort: LearningEffort | null }) {
  const [range, setRange] = useState<Range>("weekly");
  // Recharts' ResponsiveContainer needs a real DOM to measure.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const series = effort ? effort[range] : null;
  const hasData =
    series !== null && (series.totalSeconds > 0 || series.previousTotalSeconds > 0);

  return (
    <section
      aria-label="Learning effort"
      className="flex h-full flex-col rounded-[24px] p-5 sm:p-6"
      style={CARD_STYLE}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-bold text-heading">
          Learning effort
        </h3>
        <RangeToggle range={range} onChange={setRange} />
      </div>

      {series && hasData ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-heading text-3xl font-extrabold text-slate-gray">
              {formatTimeSpent(series.totalSeconds)}
            </span>
            <span className="text-sm text-muted-foreground">
              {range === "weekly" ? "this week" : "this month"}
            </span>
          </div>
          <DeltaLine series={series} range={range} />

          {/* Explicit chart height — ResponsiveContainer's percentage height
              needs a definite ancestor height, which this auto-sized card
              doesn't have. */}
          <div className="mt-4 h-[180px] w-full">
            {isMounted ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={series.bars}
                  margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--chart-grid)"
                    strokeWidth={1}
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    dy={6}
                  />
                  <YAxis hide />
                  <Tooltip
                    content={<EffortTooltip />}
                    cursor={{ fill: "var(--assignment-calendar-nav-bg)" }}
                  />
                  <Bar dataKey="seconds" radius={[8, 8, 0, 0]} maxBarSize={36}>
                    {series.bars.map((bar) => (
                      <Cell
                        key={bar.label}
                        fill={
                          bar.isCurrent
                            ? "var(--assignment-completed)"
                            : "var(--assignment-progress-fill)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="h-full w-full animate-pulse rounded-xl"
                style={{ background: "var(--surface-muted)" }}
              />
            )}
          </div>
        </>
      ) : (
        <div className="flex min-h-[200px] flex-1 items-center justify-center">
          <p className="max-w-[36ch] text-center text-sm text-muted-foreground">
            {effort === null
              ? "Practice time is unavailable right now."
              : "No practice time recorded yet. Start a practice session and your learning effort will show up here."}
          </p>
        </div>
      )}
    </section>
  );
}
