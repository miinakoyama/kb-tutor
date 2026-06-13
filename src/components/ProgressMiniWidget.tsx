"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { Flame, Clock } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  calculateMastery,
  calculateTrends,
  PROGRESS_TOPICS,
  type AttemptRow,
  type MasteryDatum,
  type TrendDirection,
} from "@/lib/progress/mastery";
import { calculateStreak } from "@/lib/progress/streak";
import { getBrowserTimeZone, DEFAULT_APP_TIME_ZONE } from "@/lib/timezone";
import { syncTimeZoneFromDb } from "@/lib/timezone-settings";

const LOOKBACK_DAYS = 365;
const FETCH_LIMIT = 2000;
const WEEK_DAYS = 7;

const TOPIC_SHORT_LABELS: Record<string, string> = {
  "Module A - Structure and Function": "Structure & Function",
  "Module A - Matter and Energy in Organisms and Ecosystems": "Matter & Energy",
  "Module A - Interdependent Relationships in Ecosystems": "Ecosystems I",
  "Module B - Inheritance and Variation of Traits": "Inheritance",
  "Module B - Interdependent Relationships in Ecosystems": "Ecosystems II",
  "Module B - Natural Selection and Evolution": "Evolution",
};

const LABEL_TO_TOPIC = new Map(
  PROGRESS_TOPICS.map(({ key }) => [TOPIC_SHORT_LABELS[key] ?? key, key]),
);

type AttemptWithTime = AttemptRow & {
  assignment_id: string | null;
  time_spent_sec: number | null;
};

const TREND_COLOR: Record<TrendDirection, string> = {
  up: "#16a34a",
  down: "#dc2626",
  flat: "#94a3b8",
};

const TREND_SYMBOL: Record<TrendDirection, string> = {
  up: "▲",
  down: "▼",
  flat: "●",
};

function formatTimeSpent(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0 min";
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/**
 * Custom PolarAngleAxis tick that appends a small trend marker (▲/▼/●)
 * after each strand label, colored to show whether mastery improved,
 * declined, or stayed flat since the student's last session.
 */
function TrendAxisTick(
  props: {
    x?: number | string;
    y?: number | string;
    textAnchor?: "middle" | "start" | "end" | "inherit";
    payload?: { value?: string };
  } & {
    trends: Map<string, TrendDirection>;
    labelToTopic: Map<string, string>;
  },
) {
  const { x = 0, y = 0, textAnchor = "middle", payload, trends, labelToTopic } = props;
  const label = payload?.value ?? "";
  const fullTopic = labelToTopic.get(label);
  const trend = fullTopic ? trends.get(fullTopic) : undefined;

  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={9} dy={3}>
      <tspan fill="#6b7280">{label}</tspan>
      {trend && (
        <tspan fill={TREND_COLOR[trend]} fontWeight="bold">
          {" "}
          {TREND_SYMBOL[trend]}
        </tspan>
      )}
    </text>
  );
}

export function ProgressMiniWidget() {
  const [isChartMounted, setIsChartMounted] = useState(false);
  const [chartData, setChartData] = useState<MasteryDatum[]>(() =>
    PROGRESS_TOPICS.map(({ key }) => ({
      topic: TOPIC_SHORT_LABELS[key] ?? key,
      fullTopic: key,
      mastery: 0,
      masteryValue: 0,
      attempts: 0,
      correct: 0,
      level: "insufficient_data",
      fill: "#94a3b8",
    })),
  );
  const [streak, setStreak] = useState(0);
  const [timeThisWeek, setTimeThisWeek] = useState(0);
  const [trends, setTrends] = useState<Map<string, TrendDirection>>(new Map());

  useEffect(() => {
    setIsChartMounted(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      const browserTimeZone = getBrowserTimeZone(DEFAULT_APP_TIME_ZONE);
      const timeZone = await syncTimeZoneFromDb(browserTimeZone);

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
        .select("is_correct,answered_at,topic,standard_id,assignment_id,time_spent_sec")
        .eq("user_id", user.id)
        .gte("answered_at", since.toISOString())
        .order("answered_at", { ascending: false })
        .limit(FETCH_LIMIT);

      if (error || !data) return;

      const rows = data as AttemptWithTime[];

      const mastery = calculateMastery(rows);
      setChartData(
        mastery.map((d) => ({
          ...d,
          topic: TOPIC_SHORT_LABELS[d.topic] ?? d.topic,
        })),
      );

      setStreak(calculateStreak(rows, timeZone));
      setTrends(calculateTrends(rows, timeZone));

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - WEEK_DAYS);
      const weekSeconds = rows
        .filter((row) => new Date(row.answered_at) >= weekAgo)
        .reduce((sum, row) => sum + (row.time_spent_sec ?? 0), 0);
      setTimeThisWeek(weekSeconds);
    };
    void load();
  }, []);

  return (
    <div className="rounded-2xl border border-primary/25 bg-surface p-5 sm:p-6 shadow-sm flex flex-col h-full">
      <span className="font-semibold text-primary dark:text-forest mb-4">
        My Progress
      </span>

      <div className="grid gap-4 sm:grid-cols-2 flex-1">
        <div className="h-[160px] min-w-0">
          {isChartMounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData}>
                <PolarGrid stroke="#2d6a4f" strokeOpacity={0.2} />
                <PolarAngleAxis
                  dataKey="topic"
                  tick={(props) => (
                    <TrendAxisTick
                      {...props}
                      trends={trends}
                      labelToTopic={LABEL_TO_TOPIC}
                    />
                  )}
                />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="masteryValue"
                  stroke="#16a34a"
                  fill="#16a34a"
                  fillOpacity={0.6}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full animate-pulse rounded-xl bg-surface-muted" />
          )}
        </div>

        <div className="flex flex-col justify-center gap-6">
          <div className="flex items-center gap-3">
            <Flame className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Learning streak</p>
              <p className="text-base font-semibold text-heading">
                {streak} {streak === 1 ? "day" : "days"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Time this week</p>
              <p className="text-base font-semibold text-heading">
                {formatTimeSpent(timeThisWeek)}
              </p>
            </div>
          </div>
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
