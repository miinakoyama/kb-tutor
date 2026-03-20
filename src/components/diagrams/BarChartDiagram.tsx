"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartData } from "@/types/question";

interface BarChartDiagramProps {
  data: ChartData;
}

export function BarChartDiagram({ data }: BarChartDiagramProps) {
  const chartData = data.data.map((d) => ({
    label: d.label || d.x,
    value: d.y,
  }));

  return (
    <div className="w-full bg-white p-4 border border-gray-300 rounded">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-black mb-2">
          {data.title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={250}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#999" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#000" }}
            stroke="#000"
            label={{
              value: data.xAxisLabel,
              position: "bottom",
              offset: 10,
              fontSize: 12,
              fill: "#000",
            }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#000" }}
            stroke="#000"
            label={{
              value: data.yAxisLabel,
              angle: -90,
              position: "insideLeft",
              offset: 10,
              fontSize: 12,
              fill: "#000",
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #000",
              borderRadius: "4px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="value" fill="#888" stroke="#000" strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
