"use client";

import { useEffect, useState } from "react";
import { Flame, Quote } from "lucide-react";
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
import { calculateStreak } from "@/lib/progress/streak";
import { getBrowserTimeZone, DEFAULT_APP_TIME_ZONE } from "@/lib/timezone";
import { syncTimeZoneFromDb } from "@/lib/timezone-settings";

const PROGRESS_LOOKBACK_DAYS = 365;
const PROGRESS_FETCH_LIMIT = 2000;
const QUOTE_FALLBACK = "Keep showing up. Progress compounds over time.";
const ASSIGNMENT_CARD_STYLE = {
  background: "var(--assignment-glass-bg)",
  border: "1px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-card-shadow)",
  backdropFilter: "blur(14px) saturate(115%)",
  WebkitBackdropFilter: "blur(14px) saturate(115%)",
} as const;

const ASSIGNMENT_PANEL_STYLE = {
  background: "var(--assignment-glass-bg)",
  border: "1px solid var(--assignment-panel-border)",
  boxShadow: "var(--assignment-card-shadow)",
  backdropFilter: "blur(14px) saturate(115%)",
  WebkitBackdropFilter: "blur(14px) saturate(115%)",
} as const;

function splitQuoteAndAuthor(rawQuote: string): { quote: string; author: string | null } {
  const normalized = rawQuote.trim();
  const separators = [" – ", " - "];

  for (const separator of separators) {
    const splitIndex = normalized.lastIndexOf(separator);
    if (splitIndex === -1) continue;

    const quote = normalized.slice(0, splitIndex).trim();
    const author = normalized.slice(splitIndex + separator.length).trim();
    if (quote.length > 0 && author.length > 0) {
      return { quote, author };
    }
  }

  return { quote: normalized, author: null };
}

export default function ProgressPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [isChartMounted, setIsChartMounted] = useState(false);
  const [dailyQuote, setDailyQuote] = useState(QUOTE_FALLBACK);
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

  const { quote: quoteText, author: quoteAuthor } = splitQuoteAndAuthor(dailyQuote);

  useEffect(() => {
    let isActive = true;

    const loadDailyQuote = async () => {
      try {
        const response = await fetch("/progress-quotes.txt");
        if (!response.ok) {
          throw new Error("Failed to load quotes");
        }

        const text = await response.text();
        const quotes = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        if (quotes.length === 0) {
          throw new Error("No quotes found");
        }

        const randomIndex = Math.floor(Math.random() * quotes.length);
        const quote = quotes[randomIndex] ?? QUOTE_FALLBACK;
        if (isActive) {
          setDailyQuote(quote);
        }
      } catch {
        if (isActive) {
          setDailyQuote(QUOTE_FALLBACK);
        }
      }
    };

    void loadDailyQuote();

    return () => {
      isActive = false;
    };
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

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-8 tracking-[-0.02em]">
        My Progress
      </h1>

      <div className="space-y-8">
        {errorMessage && (
          <section className="rounded-2xl border border-error-border bg-error-light/90 px-4 py-3 shadow-sm">
            <p className="text-sm text-error">{errorMessage}</p>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section
            className="rounded-2xl p-6"
            style={ASSIGNMENT_CARD_STYLE}
          >
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

          <section
            className="rounded-2xl p-6"
            style={ASSIGNMENT_CARD_STYLE}
          >
            <h2 className="text-lg font-medium text-slate-gray mb-4 flex items-center gap-2">
              <Quote className="w-5 h-5 text-primary" />
              Daily Quote
            </h2>
            <p className="text-slate-gray leading-relaxed">{quoteText}</p>
            {quoteAuthor ? (
              <p className="mt-2 text-sm text-muted-foreground">- {quoteAuthor}</p>
            ) : null}
          </section>
        </div>

        <section
          className="rounded-2xl p-6"
          style={ASSIGNMENT_PANEL_STYLE}
        >
          <h2 className="text-lg font-medium text-slate-gray mb-2">
            Topic Mastery
          </h2>
          <div
            className="h-[280px] sm:h-[360px] md:h-[400px] min-h-[200px] w-full min-w-0 rounded-xl p-2"
            style={{
              background: "var(--assignment-glass-bg-strong)",
              border: "1px solid var(--assignment-glass-border)",
            }}
          >
            {isChartMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={masteryData}>
                  <PolarGrid stroke="#2d6a4f" strokeOpacity={0.3} />
                  <PolarAngleAxis
                    dataKey="topic"
                    tick={{ fill: "#2c3e2e", fontSize: 11 }}
                    tickMargin={14}
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
                      backgroundColor: "var(--assignment-popover-bg)",
                      border: "1px solid var(--assignment-popover-border)",
                      borderRadius: "8px",
                      boxShadow: "var(--assignment-popover-shadow)",
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
