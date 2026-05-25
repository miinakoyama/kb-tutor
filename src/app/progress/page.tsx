"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  calculateMastery,
  PROGRESS_TOPICS,
  type AttemptRow,
  type MasteryDatum,
} from "@/lib/progress/mastery";
import { getBrowserTimeZone, DEFAULT_APP_TIME_ZONE } from "@/lib/timezone";
import { syncTimeZoneFromDb } from "@/lib/timezone-settings";

const PROGRESS_LOOKBACK_DAYS = 365;
const PROGRESS_FETCH_LIMIT = 2000;

function toDateKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
  }).format(value);
}

/**
 * Calculates current daily streak from answered timestamps in the user's timezone.
 * A streak counts consecutive calendar days up to today.
 */
function calculateStreak(rows: AttemptRow[], timeZone: string): number {
  const answeredDates = new Set(
    rows.map((row) => toDateKey(new Date(row.answered_at), timeZone)),
  );
  if (answeredDates.size === 0) return 0;

  let streak = 0;
  const cursor = new Date();

  while (true) {
    const key = toDateKey(cursor, timeZone);
    if (!answeredDates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export default function ProgressPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [isChartMounted, setIsChartMounted] = useState(false);
  const [masteryData, setMasteryData] = useState<MasteryDatum[]>(() =>
    PROGRESS_TOPICS.map(({ key }) => ({
      topic: key,
      fullTopic: key,
      mastery: 0,
      masteryValue: 0,
      attempts: 0,
      correct: 0,
      level: "insufficient_data",
      fill: "#94a3b8",
    })),
  );

  useEffect(() => {
    setIsChartMounted(true);
  }, []);

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const browserTimeZone = getBrowserTimeZone(DEFAULT_APP_TIME_ZONE);
        const timeZone = await syncTimeZoneFromDb(browserTimeZone);

        const since = new Date();
        since.setDate(since.getDate() - PROGRESS_LOOKBACK_DAYS);

        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          setErrorMessage(
            "Failed to load progress data. Please refresh and try again.",
          );
          return;
        }

        const { data, error } = await supabase
          .from("attempts")
          .select("is_correct,answered_at,topic,standard_id")
          .eq("user_id", user.id)
          .gte("answered_at", since.toISOString())
          .order("answered_at", { ascending: false })
          .limit(PROGRESS_FETCH_LIMIT);

        if (error) {
          setErrorMessage(
            "Failed to load progress data. Please refresh and try again.",
          );
          return;
        }

        const rows = (data ?? []) as AttemptRow[];
        setStreak(calculateStreak(rows, timeZone));
        setMasteryData(calculateMastery(rows));
        setErrorMessage(null);
      } catch {
        setErrorMessage(
          "Failed to load progress data. Please refresh and try again.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadProgress();
  }, []);

  const attemptedTopicCount = useMemo(
    () => masteryData.filter((item) => item.attempts > 0).length,
    [masteryData],
  );

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-8">
        My Progress
      </h1>

      <div className="space-y-8">
        {errorMessage && (
          <section className="rounded-lg border border-error-border bg-error-light px-4 py-3">
            <p className="text-sm text-error">{errorMessage}</p>
          </section>
        )}

        <section className="rounded-lg border border-leaf/30 bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-gray mb-4 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Learning Streak
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-leaf">
              {isLoading ? "--" : streak}
            </span>
            <span className="text-slate-gray">days in a row</span>
          </div>
        </section>

        <section className="rounded-lg border border-leaf/30 bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-gray mb-2">
            Topic Mastery
          </h2>
          <p className="text-sm text-slate-gray/80 mb-4">
            Mastery by module/category topics.
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            {isLoading
              ? "Loading progress..."
              : `${attemptedTopicCount}/${masteryData.length} topics have attempt data (estimated until enough attempts).`}
          </p>
          <div className="h-[280px] sm:h-[360px] md:h-[400px] min-h-[200px] w-full min-w-0">
            {isChartMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={masteryData}>
                  <PolarGrid stroke="#2d6a4f" strokeOpacity={0.3} />
                  <PolarAngleAxis
                    dataKey="topic"
                    tick={{ fill: "#2c3e2e", fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fill: "#2c3e2e", fontSize: 10 }}
                  />
                  <Radar
                    name="Mastery %"
                    dataKey="masteryValue"
                    stroke="#16a34a"
                    fill="#16a34a"
                    fillOpacity={0.6}
                    strokeWidth={2}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#f8f6f3",
                      border: "1px solid #2d6a4f",
                      borderRadius: "8px",
                    }}
                    formatter={(value, _name, item) => {
                      const payload = item?.payload as MasteryDatum | undefined;
                      const mastery = typeof value === "number" ? value : 0;
                      const attempts = payload?.attempts ?? 0;
                      if (!payload || payload.level === "insufficient_data") {
                        return ["Not enough data yet", "Mastery"];
                      }
                      const suffix =
                        payload.level === "estimated" ? " (estimated)" : "";
                      return [
                        `${mastery}% (${attempts} attempts)${suffix}`,
                        "Mastery",
                      ];
                    }}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload as
                        | MasteryDatum
                        | undefined;
                      return row?.fullTopic ?? String(label ?? "");
                    }}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full animate-pulse rounded-xl bg-surface-muted" />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
