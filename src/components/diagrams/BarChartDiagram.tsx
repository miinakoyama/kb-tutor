"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "@/components/ThemeProvider";
import { getChartThemeColors } from "@/lib/chart-theme";
import type { ChartData } from "@/types/question";

interface BarChartDiagramProps {
  data: ChartData;
}

export function BarChartDiagram({ data }: BarChartDiagramProps) {
  const { resolvedTheme } = useTheme();
  const colors = getChartThemeColors(resolvedTheme);
  const chartData = data.data.map((d) => ({
    label: d.label || d.x,
    value: d.y,
  }));

  return (
    <div className="w-full bg-surface p-4 border border-border-default rounded">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-foreground mb-2">
          {data.title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 12, right: 24, left: 48, bottom: 32 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            dataKey="label"
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
          <Bar
            dataKey="value"
            fill={colors.primary}
            stroke={colors.axis}
            strokeWidth={1}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
