import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccuracyLineChart } from "./AccuracyLineChart";
import type { ChartPoint } from "@/lib/analytics/teacher-analytics-types";

// Recharts in jsdom relies on layout APIs that are not implemented; the
// chart still renders the surrounding wrapper, the small-sample badge,
// and the empty state, which is what we assert.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-line-chart">{children}</div>
  ),
  Line: ({ dataKey }: { dataKey: string }) => (
    <span data-testid="recharts-line" data-data-key={dataKey} />
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

afterEach(() => cleanup());

function points(): ChartPoint[] {
  return [
    {
      attemptIndex: 1,
      answeredAt: "2026-05-22T08:00:00Z",
      rollingAccuracy: 1,
      cumulativeAccuracy: 1,
      isSmallSample: true,
    },
    {
      attemptIndex: 2,
      answeredAt: "2026-05-22T08:01:00Z",
      rollingAccuracy: 0.5,
      cumulativeAccuracy: 0.5,
      isSmallSample: true,
    },
  ];
}

describe("AccuracyLineChart", () => {
  it("renders the rolling series by default", () => {
    render(<AccuracyLineChart points={points()} view="rolling" />);
    const line = screen.getByTestId("recharts-line");
    expect(line.getAttribute("data-data-key")).toBe("rollingAccuracy");
  });

  it("switches series when view becomes cumulative", () => {
    render(<AccuracyLineChart points={points()} view="cumulative" />);
    const line = screen.getByTestId("recharts-line");
    expect(line.getAttribute("data-data-key")).toBe("cumulativeAccuracy");
  });

  it("shows the small-sample badge when any point is flagged", () => {
    render(<AccuracyLineChart points={points()} view="rolling" />);
    expect(screen.getByText(/Small sample/i)).toBeDefined();
  });

  it("does not show the small-sample badge once every point is past the threshold", () => {
    const full: ChartPoint[] = points().map((p) => ({
      ...p,
      isSmallSample: false,
    }));
    render(<AccuracyLineChart points={full} view="rolling" />);
    expect(screen.queryByText(/Small sample/i)).toBeNull();
  });

  it("renders the empty state when there are no points", () => {
    render(<AccuracyLineChart points={[]} view="rolling" />);
    expect(screen.getByText(/No attempts to chart/i)).toBeDefined();
  });
});
