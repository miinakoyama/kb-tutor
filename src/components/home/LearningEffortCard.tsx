"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTimeSpent } from "@/lib/format-time";
import type {
  EffortCategory,
  EffortSeries,
  LearningEffort,
} from "@/lib/homepage/learning-effort";

type Range = "weekly" | "monthly";

/** Category → label + pie color (distinct hues). */
const CATEGORY_META: Record<
  EffortCategory,
  { label: string; color: string }
> = {
  practice: { label: "Practice", color: "#3A5C96" },
  exam: { label: "Exam", color: "#ED9ABB" },
  review: { label: "Review", color: "#F8DFA0" },
};

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

/**
 * Always occupies its line (an invisible placeholder when there is no
 * comparison) so toggling Weekly/Monthly never shifts the cards below or
 * the countdown card sharing the row.
 */
function DeltaLine({ series, range }: { series: EffortSeries; range: Range }) {
  if (series.deltaPercent === null) {
    return (
      <p className="invisible mt-1 text-xs" aria-hidden="true">
        &nbsp;
      </p>
    );
  }
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
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "inset 0 1px 3px rgb(31 45 31 / 0.06)",
      }}
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
            className="rounded-full px-3 py-1 text-xs font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            style={
              isActive
                ? {
                    // Light-green glass bead: translucent green fill, a
                    // bright top highlight and a soft drop below for the
                    // glossy convex look.
                    color: "var(--assignment-completed)",
                    background:
                      "linear-gradient(180deg, rgba(168,197,183,0.18) 0%, rgba(168,197,183,0.09) 100%)",
                    boxShadow:
                      "inset 0 1px 1px rgba(255,255,255,0.75), inset 0 -1px 2px rgba(12,107,69,0.12), 0 2px 5px rgba(12,107,69,0.18)",
                    backdropFilter: "blur(6px) saturate(140%)",
                    WebkitBackdropFilter: "blur(6px) saturate(140%)",
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
 * Right column: a tall donut whose top aligns with the delta line and whose
 * bottom sits on the bar baseline, with the legend below it — level with the
 * bar chart's weekday labels. Only rendered when the period has a breakdown.
 */
function BreakdownPie({
  breakdown,
  totalSeconds,
  isMounted,
}: {
  breakdown: EffortSeries["breakdown"];
  totalSeconds: number;
  isMounted: boolean;
}) {
  const data = breakdown.map((slice) => ({
    ...slice,
    ...CATEGORY_META[slice.category],
  }));

  return (
    <div className="flex min-w-0 flex-[3_1_0%] flex-col">
      <div className="min-h-0 flex-1">
        {isMounted && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="seconds"
                nameKey="label"
                innerRadius="55%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {data.map((slice) => (
                  <Cell key={slice.category} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip content={<BreakdownTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend, level with the bar's weekday labels. */}
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 pt-1">
        {data.map((slice) => (
          <li key={slice.category} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: slice.color }}
              aria-hidden="true"
            />
            <span className="text-slate-gray">{slice.label}</span>
            <span className="flex-shrink-0 font-semibold text-muted-foreground">
              {Math.round((slice.seconds / totalSeconds) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BreakdownTooltip({
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
  // Empty state is decided across BOTH ranges: if either has data, both
  // render the chart layout (a range with no time shows zero-height bars).
  // Deciding per range would swap the whole layout on toggle.
  const hasData =
    effort !== null &&
    [effort.weekly, effort.monthly].some(
      (s) => s.totalSeconds > 0 || s.previousTotalSeconds > 0,
    );

  return (
    <section
      aria-label="Learning effort"
      className="flex h-full flex-col rounded-[24px] p-5 sm:p-6"
      style={CARD_STYLE}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-bold text-slate-gray">
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
          {/* Left column (delta + bar) and the pie column share one
              fixed-height row so the donut's top lines up with the delta
              line and its bottom with the bar baseline. */}
          <div className="mt-2 flex h-[150px] w-full items-stretch gap-3">
            <div
              className={`flex min-w-0 flex-col ${
                series.breakdown.length > 0 ? "flex-[7_1_0%]" : "flex-1"
              }`}
            >
              <DeltaLine series={series} range={range} />
              <div className="mt-1 min-h-0 flex-1">
                {isMounted ? (
                  <ResponsiveContainer width="100%" height="100%">
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
            </div>

            {series.breakdown.length > 0 && (
              <>
                <div
                  className="w-px self-stretch"
                  style={{ background: "var(--border-subtle)" }}
                  aria-hidden="true"
                />
                <BreakdownPie
                  breakdown={series.breakdown}
                  totalSeconds={series.totalSeconds}
                  isMounted={isMounted}
                />
              </>
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
