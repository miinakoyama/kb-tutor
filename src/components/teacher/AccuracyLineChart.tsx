"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint } from "@/lib/analytics/teacher-analytics-types";

interface ChartTooltipPayloadEntry {
  payload?: ChartPoint;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadEntry[];
}

interface Props {
  points: ChartPoint[];
  view: "rolling" | "cumulative";
}

function formatPercent(value: number | string | undefined): string {
  if (value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-gray">
        Attempt {point.attemptIndex}
      </p>
      <p className="text-slate-gray/70">
        {new Date(point.answeredAt).toLocaleString()}
      </p>
      <p className="text-slate-gray">
        Rolling (20): {formatPercent(point.rollingAccuracy)}
      </p>
      <p className="text-slate-gray">
        Cumulative: {formatPercent(point.cumulativeAccuracy)}
      </p>
    </div>
  );
}

export function AccuracyLineChart({ points, view }: Props) {
  const hasSmallSample = useMemo(
    () => points.some((p) => p.isSmallSample),
    [points],
  );

  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/40 text-sm text-slate-gray/60">
        No attempts to chart yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hasSmallSample && (
        <p
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700"
          role="note"
        >
          Small sample — interpret with care
        </p>
      )}
      <div
        className="h-56 w-full"
        role="img"
        aria-label={
          view === "rolling"
            ? "Rolling 20-attempt accuracy line chart"
            : "Cumulative accuracy line chart"
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="attemptIndex"
              tick={{ fontSize: 11, fill: "#475569" }}
              label={{
                value: "Attempt #",
                position: "insideBottom",
                offset: -2,
                style: { fontSize: 11, fill: "#475569" },
              }}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
              tick={{ fontSize: 11, fill: "#475569" }}
              width={42}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  {...(props as unknown as ChartTooltipProps)}
                />
              )}
            />
            <Line
              type="monotone"
              dataKey={
                view === "rolling" ? "rollingAccuracy" : "cumulativeAccuracy"
              }
              stroke="#16a34a"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
