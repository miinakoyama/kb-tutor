"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ReactNode } from "react";
import type { StimulusAsset, ChartData } from "@/types/short-answer";
import { validateDiagramSvg } from "@/lib/short-answer/item-schema";
import { HIGHLIGHT_ZONE_ATTR } from "@/lib/short-answer/highlight";

/** Parse a simple GitHub-style markdown table into headers + rows. */
function parseMarkdownTable(md: string): { headers: string[]; rows: string[][] } {
  const lines = md
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const splitRow = (line: string) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitRow(lines[0]);
  const rows = lines
    .slice(2)
    .map(splitRow)
    .filter((r) => r.some((c) => c.length > 0));
  return { headers, rows };
}

function TableStimulusView({ md }: { md: string }) {
  const { headers, rows } = useMemo(() => parseMarkdownTable(md), [md]);
  if (headers.length === 0) {
    return <pre className="whitespace-pre-wrap text-sm">{md}</pre>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border-b border-[color:var(--assignment-panel-border)] px-3 py-2 text-left font-semibold text-[color:var(--foreground)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className="border-b border-[color:var(--assignment-panel-border)]/60 px-3 py-2 text-[color:var(--foreground)]/85"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Convert the item chart shape into Recharts row objects keyed by series. */
function toChartRows(chart: ChartData): {
  rows: Record<string, number | string>[];
  seriesNames: string[];
} {
  const seriesNames = chart.series.map((s) => s.name);
  const byX = new Map<string | number, Record<string, number | string>>();
  for (const series of chart.series) {
    for (const [x, y] of series.points) {
      const row = byX.get(x) ?? { x };
      row[series.name] = y;
      byX.set(x, row);
    }
  }
  return { rows: Array.from(byX.values()), seriesNames };
}

const GRAYSCALE = ["#374151", "#6b7280", "#9ca3af", "#d1d5db"];

function ChartStimulusView({
  chart,
  kind,
}: {
  chart: ChartData;
  kind: "line" | "bar";
}) {
  const { rows, seriesNames } = useMemo(() => toChartRows(chart), [chart]);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {kind === "line" ? (
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="x"
              label={{ value: chart.xLabel, position: "bottom", fontSize: 12 }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              label={{ value: chart.yLabel, angle: -90, position: "insideLeft", fontSize: 12 }}
              tick={{ fontSize: 11 }}
            />
            <Tooltip />
            {seriesNames.length > 1 && <Legend />}
            {seriesNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={GRAYSCALE[i % GRAYSCALE.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="x"
              label={{ value: chart.xLabel, position: "bottom", fontSize: 12 }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              label={{ value: chart.yLabel, angle: -90, position: "insideLeft", fontSize: 12 }}
              tick={{ fontSize: 11 }}
            />
            <Tooltip />
            {seriesNames.length > 1 && <Legend />}
            {seriesNames.map((name, i) => (
              <Bar key={name} dataKey={name} fill={GRAYSCALE[i % GRAYSCALE.length]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function DiagramStimulusView({ svg, title }: { svg: string; title: string }) {
  // Defense in depth: only render as an <img> data URI when the SVG passes the
  // safety validator (no script/handlers/external refs). Never inject raw HTML.
  const safe = validateDiagramSvg(svg) === null;
  if (!safe) {
    return (
      <p className="text-sm text-[color:var(--foreground)]/60">
        This diagram could not be displayed.
      </p>
    );
  }
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={title} className="max-h-80 w-full object-contain" />;
}

function IllustrationStimulusView({
  prompt,
  imageB64,
  title,
}: {
  prompt: string;
  imageB64?: string;
  title: string;
}) {
  if (imageB64) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`data:image/png;base64,${imageB64}`}
        alt={title}
        className="max-h-96 w-full object-contain"
      />
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-[color:var(--assignment-panel-border)] p-4 text-sm text-[color:var(--foreground)]/60">
      Illustration: {prompt}
    </div>
  );
}

function StimulusBody({ stimulus }: { stimulus: StimulusAsset }): ReactNode {
  switch (stimulus.type) {
    case "table":
      return <TableStimulusView md={stimulus.tableMarkdown} />;
    case "line_graph":
      return <ChartStimulusView chart={stimulus.chartData} kind="line" />;
    case "bar_chart":
      return <ChartStimulusView chart={stimulus.chartData} kind="bar" />;
    case "diagram":
      return <DiagramStimulusView svg={stimulus.diagramSvg} title={stimulus.title} />;
    case "scenario":
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--foreground)]/85">
          {stimulus.scenarioText}
        </p>
      );
    case "illustration":
      return (
        <IllustrationStimulusView
          prompt={stimulus.illustrationPrompt}
          imageB64={stimulus.imageB64}
          title={stimulus.title}
        />
      );
  }
}

interface StimulusPanelProps {
  stem: string;
  stimulus: StimulusAsset;
}

export function StimulusPanel({ stem, stimulus }: StimulusPanelProps) {
  return (
    <section
      {...{ [HIGHLIGHT_ZONE_ATTR]: "" }}
      className="flex flex-col gap-4 rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] p-5 backdrop-blur-md"
      style={{ boxShadow: "var(--assignment-card-shadow)" }}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/55">
          Scenario
        </h2>
      </header>

      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[color:var(--foreground)]">
        {stem}
      </p>

      <figure className="flex flex-col gap-2 rounded-xl border border-[color:var(--assignment-panel-border)] bg-[color:var(--assignment-glass-bg-strong)] p-4">
        <figcaption className="text-sm font-semibold text-[color:var(--foreground)]">
          {stimulus.title}
        </figcaption>
        <StimulusBody stimulus={stimulus} />
      </figure>
    </section>
  );
}
