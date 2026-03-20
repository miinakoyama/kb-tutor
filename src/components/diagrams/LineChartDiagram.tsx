"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartData } from "@/types/question";

interface LineChartDiagramProps {
  data: ChartData;
}

export function LineChartDiagram({ data }: LineChartDiagramProps) {
  return (
    <div className="w-full bg-white p-4 border border-gray-300 rounded">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-black mb-2">
          {data.title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={250}>
        <LineChart
          data={data.data}
          margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#999" />
          <XAxis
            dataKey="x"
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
          <Line
            type="monotone"
            dataKey="y"
            stroke="#000"
            strokeWidth={2}
            dot={{ fill: "#000", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: "#333" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
