"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  calculateMastery,
  getMasteryBand,
  PROGRESS_TOPICS,
  type AttemptRow,
  type MasteryBand,
  type MasteryDatum,
} from "@/lib/progress/mastery";

const LOOKBACK_DAYS = 365;
const FETCH_LIMIT = 2000;

const TOPIC_SHORT_LABELS: Record<string, string> = {
  "Module A - Structure and Function": "Structure",
  "Module A - Matter and Energy in Organisms and Ecosystems": "Matter & Energy",
  "Module A - Interdependent Relationships in Ecosystems": "Ecosystems I",
  "Module B - Inheritance and Variation of Traits": "Inheritance",
  "Module B - Interdependent Relationships in Ecosystems": "Ecosystems II",
  "Module B - Natural Selection and Evolution": "Evolution",
};

const BAND_COLOR: Record<MasteryBand, string> = {
  no_data: "#cbd5e1",
  getting_started: "#ef4444",
  building_up: "#f59e0b",
  on_track: "#3b82f6",
  mastered: "#16a34a",
};

const BAND_LABEL: Record<MasteryBand, string> = {
  no_data: "No data yet",
  getting_started: "Just getting started",
  building_up: "Building up",
  on_track: "On track",
  mastered: "Mastered",
};

type ChartDatum = {
  label: string;
  fullTopic: string;
  displayValue: number;
  color: string;
  status: string;
};

function ColoredBar(props: unknown) {
  const { x, y, width, height, color } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  };
  if (!height || height <= 0) return null;
  const r = Math.min(4, width / 2, height);
  return (
    <path
      d={`M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`}
      fill={color}
    />
  );
}

const LEGEND_BANDS: MasteryBand[] = [
  "getting_started",
  "building_up",
  "on_track",
  "mastered",
];

export function ProgressMiniWidget() {
  const [isChartMounted, setIsChartMounted] = useState(false);
  const [chartData, setChartData] = useState<ChartDatum[]>(() =>
    PROGRESS_TOPICS.map(({ key }) => ({
      label: TOPIC_SHORT_LABELS[key] ?? key,
      fullTopic: key,
      displayValue: 5,
      color: BAND_COLOR.no_data,
      status: BAND_LABEL.no_data,
    })),
  );

  useEffect(() => {
    setIsChartMounted(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      const since = new Date();
      since.setDate(since.getDate() - LOOKBACK_DAYS);

      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) return;

      const { data, error } = await supabase
        .from("attempts")
        .select("is_correct,answered_at,topic,standard_id")
        .eq("user_id", user.id)
        .gte("answered_at", since.toISOString())
        .order("answered_at", { ascending: false })
        .limit(FETCH_LIMIT);

      if (error) return;

      const mastery = calculateMastery((data ?? []) as AttemptRow[]);
      setChartData(
        mastery.map((d: MasteryDatum) => {
          const band = getMasteryBand(d.correct, d.attempts);
          return {
            label: TOPIC_SHORT_LABELS[d.topic] ?? d.topic,
            fullTopic: d.fullTopic,
            // Show a small stub for no-data bars so they remain visible
            displayValue: band === "no_data" ? 5 : d.masteryValue,
            color: BAND_COLOR[band],
            status: BAND_LABEL[band],
          };
        }),
      );
    };
    void load();
  }, []);

  return (
    <div className="rounded-2xl border border-primary/25 bg-surface p-5 sm:p-6 shadow-sm flex flex-col h-full">
      <span className="font-semibold text-primary dark:text-forest mb-4">
        My Progress
      </span>

      <div className="flex gap-4 flex-1 min-h-[180px]">
        <div className="flex-1 min-w-0">
          {isChartMounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                barCategoryGap="25%"
                margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
              >
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as ChartDatum;
                    return (
                      <div className="rounded-lg border border-border-default bg-surface px-3 py-2 text-xs shadow-md">
                        <p className="font-medium text-heading mb-0.5">{d.label}</p>
                        <span
                          className="font-semibold"
                          style={{ color: d.color === BAND_COLOR.no_data ? "#94a3b8" : d.color }}
                        >
                          {d.status}
                        </span>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="displayValue" shape={<ColoredBar />} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full animate-pulse rounded-xl bg-surface-muted" />
          )}
        </div>

        <div className="flex flex-col justify-center gap-2 flex-shrink-0">
          {LEGEND_BANDS.map((band) => (
            <span key={band} className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
              <span
                className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                style={{ backgroundColor: BAND_COLOR[band] }}
              />
              {BAND_LABEL[band]}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Link
          href="/self-practice"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
        >
          Start self practice
        </Link>
      </div>
    </div>
  );
}
