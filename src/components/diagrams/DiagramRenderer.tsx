"use client";

import type { Diagram, ChartData, TableData, FlowchartData, SvgDiagramData } from "@/types/question";
import { LineChartDiagram } from "./LineChartDiagram";
import { BarChartDiagram } from "./BarChartDiagram";
import { TableDiagram } from "./TableDiagram";
import { FlowchartDiagram } from "./FlowchartDiagram";
import { SvgDiagram } from "./SvgDiagram";

interface DiagramRendererProps {
  diagram: Diagram;
}

export function DiagramRenderer({ diagram }: DiagramRendererProps) {
  switch (diagram.type) {
    case "chart": {
      const chartData = diagram.data as ChartData;
      if (chartData.chartType === "bar") {
        return <BarChartDiagram data={chartData} />;
      }
      return <LineChartDiagram data={chartData} />;
    }
    case "table":
      return <TableDiagram data={diagram.data as TableData} />;
    case "flowchart":
      return <FlowchartDiagram data={diagram.data as FlowchartData} />;
    case "diagram":
      return <SvgDiagram data={diagram.data as SvgDiagramData} />;
    default:
      return (
        <div className="p-4 bg-gray-100 rounded-lg text-center text-sm text-gray-500">
          Unknown diagram type
        </div>
      );
  }
}
