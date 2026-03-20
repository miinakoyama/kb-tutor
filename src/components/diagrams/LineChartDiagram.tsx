"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { ChartData } from "@/types/question";

interface LineChartDiagramProps {
  data: ChartData;
}

export function LineChartDiagram({ data }: LineChartDiagramProps) {
  const hasMultiSeries = Array.isArray(data.series) && data.series.length > 0;
  const strokePalette = ["#000", "#333", "#666", "#999"];
  const dashPalette = ["0", "6 4", "2 3", "10 4"];

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
          margin={{ top: 24, right: 24, left: 42, bottom: 42 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#999" />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 12, fill: "#000" }}
            stroke="#000"
            label={{
              value: data.xAxisLabel,
              position: "bottom",
              offset: 18,
              fontSize: 12,
              fill: "#000",
            }}
          />
          <YAxis
            width={68}
            tick={{ fontSize: 12, fill: "#000" }}
            stroke="#000"
            label={{
              value: data.yAxisLabel,
              angle: -90,
              position: "insideLeft",
              offset: 4,
              dx: -14,
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
              stroke="#000"
              strokeWidth={2}
              dot={{ fill: "#000", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: "#333" }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
