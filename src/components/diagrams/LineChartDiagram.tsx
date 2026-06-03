"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useTheme } from "@/components/ThemeProvider";
import { getChartThemeColors } from "@/lib/chart-theme";
import type { ChartData } from "@/types/question";

interface LineChartDiagramProps {
  data: ChartData;
}

export function LineChartDiagram({ data }: LineChartDiagramProps) {
  const { resolvedTheme } = useTheme();
  const colors = getChartThemeColors(resolvedTheme);
  const hasMultiSeries = Array.isArray(data.series) && data.series.length > 0;
  const strokePalette = [colors.foreground, colors.axis, colors.primary, colors.grid];
  const dashPalette = ["0", "6 4", "2 3", "10 4"];
  const multiSeriesData = hasMultiSeries
    ? data.data.map((point) => {
        const legacyPoint = point as unknown as Record<string, unknown>;
        const normalized: Record<string, string | number> = { x: point.x };
        if (point.label) normalized.label = point.label;

        for (const series of data.series!) {
          const valueFromSeriesValues = point.seriesValues?.[series.key];
          if (typeof valueFromSeriesValues === "number") {
            normalized[series.key] = valueFromSeriesValues;
            continue;
          }

          // Backward compatibility for older data format: { seriesA: 10, seriesB: 12 }
          const legacyValue = legacyPoint[series.key];
          if (typeof legacyValue === "number") {
            normalized[series.key] = legacyValue;
          }
        }

        return normalized;
      })
    : data.data;

  return (
    <div className="w-full bg-surface p-4 border border-border-default rounded">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-foreground mb-2">
          {data.title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={multiSeriesData}
          margin={{ top: 16, right: 24, left: 48, bottom: 32 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 12, fill: colors.axis }}
            stroke={colors.axis}
            label={{
              value: data.xAxisLabel,
              position: "bottom",
              offset: 12,
              fontSize: 12,
              fill: colors.axis,
            }}
          />
          <YAxis
            width={72}
            tick={{ fontSize: 12, fill: colors.axis }}
            stroke={colors.axis}
            label={{
              value: data.yAxisLabel,
              angle: -90,
              position: "insideLeft",
              offset: 0,
              dx: -8,
              dy: 0,
              fontSize: 12,
              fill: colors.axis,
              style: { textAnchor: "middle" },
            }}
          />
          {hasMultiSeries ? (
            <>
              <Legend
                align="right"
                verticalAlign="top"
                wrapperStyle={{ fontSize: "12px" }}
              />
              {data.series!.map((series, index) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  isAnimationActive={false}
                  stroke={strokePalette[index % strokePalette.length]}
                  strokeWidth={2}
                  strokeDasharray={dashPalette[index % dashPalette.length]}
                  dot={{
                    fill: strokePalette[index % strokePalette.length],
                    strokeWidth: 2,
                    r: 4,
                  }}
                  activeDot={{ r: 6, fill: strokePalette[index % strokePalette.length] }}
                />
              ))}
            </>
          ) : (
            <Line
              type="monotone"
              dataKey="y"
              isAnimationActive={false}
              stroke={colors.foreground}
              strokeWidth={2}
              dot={{ fill: colors.foreground, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: colors.primary }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
