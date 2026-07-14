"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { UserRound } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  calculateMastery,
  PROGRESS_TOPICS,
  type AttemptRow,
  type MasteryDatum,
} from "@/lib/progress/mastery";
import { AchievementBadges } from "@/components/home/AchievementBadges";
import type { StudentProfileSummary } from "@/lib/homepage/profile-summary";

const LOOKBACK_DAYS = 365;
const FETCH_LIMIT = 2000;

const TOPIC_SHORT_LABELS: Record<string, string> = {
  "Module A - Structure and Function": "Structure",
  "Module A - Matter and Energy in Organisms and Ecosystems": "Matter",
  "Module A - Interdependent Relationships in Ecosystems": "Ecosystems I",
  "Module B - Inheritance and Variation of Traits": "Inheritance",
  "Module B - Interdependent Relationships in Ecosystems": "Ecosystems II",
  "Module B - Natural Selection and Evolution": "Evolution",
};

const EMPTY_MASTERY: MasteryDatum[] = PROGRESS_TOPICS.map(({ key }) => ({
  topic: TOPIC_SHORT_LABELS[key] ?? key,
  fullTopic: key,
  mastery: 0,
  masteryValue: 0,
  attempts: 0,
  correct: 0,
  level: "insufficient_data",
  fill: "#94a3b8",
}));

function initialsOf(name: string | null): string {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileCard({ profile }: { profile: StudentProfileSummary }) {
  const [isMounted, setIsMounted] = useState(false);
  const [chartData, setChartData] = useState<MasteryDatum[]>(EMPTY_MASTERY);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const since = new Date();
      since.setDate(since.getDate() - LOOKBACK_DAYS);

      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("attempts")
        .select("is_correct,answered_at,topic,standard_id")
        .eq("user_id", user.id)
        .gte("answered_at", since.toISOString())
        .order("answered_at", { ascending: false })
        .limit(FETCH_LIMIT);

      if (cancelled || error || !data) return;

      const mastery = calculateMastery(data as AttemptRow[]).map((d) => ({
        ...d,
        topic: TOPIC_SHORT_LABELS[d.topic] ?? d.topic,
      }));
      setChartData(mastery);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const initials = initialsOf(profile.name);

  return (
    <div
      className="flex h-full flex-col items-center gap-4 rounded-[24px] p-5 sm:p-6"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-card-shadow)",
      }}
    >
      {/* Avatar — no avatar image data exists, so an initials placeholder
          derived from the real display name (or a neutral icon). */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full"
        style={{ background: "var(--assignment-calendar-nav-bg)" }}
      >
        {initials ? (
          <span
            className="text-2xl font-bold"
            style={{ color: "var(--assignment-completed)", fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
          >
            {initials}
          </span>
        ) : (
          <UserRound className="h-9 w-9" style={{ color: "var(--assignment-completed)" }} aria-hidden="true" />
        )}
      </div>

      <div className="text-center">
        {profile.name && (
          <p
            className="font-bold text-heading"
            style={{ fontSize: 18, fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
          >
            {profile.name}
          </p>
        )}
        {profile.schoolName && (
          <p className="mt-0.5 text-sm text-muted-foreground">{profile.schoolName}</p>
        )}
      </div>

      <Link
        href="/settings"
        className="inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-bold transition duration-200 hover:-translate-y-px active:translate-y-0 hover:bg-[var(--assignment-row-cta-bg-hover)]"
        style={{
          fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
          color: "var(--assignment-row-cta-text)",
          background: "var(--assignment-row-cta-bg)",
          border: "1.5px solid var(--assignment-row-cta-border)",
          boxShadow: "var(--assignment-row-cta-shadow)",
        }}
      >
        Edit Profile
      </Link>

      <div className="h-px w-full" style={{ background: "var(--border-subtle)" }} />

      {/* Skill radar — the same mastery model as My Progress. */}
      <div className="min-h-[220px] w-full flex-1">
        {isMounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <PolarGrid stroke="var(--assignment-completed)" strokeOpacity={0.2} />
              <PolarAngleAxis
                dataKey="topic"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="masteryValue"
                stroke="var(--assignment-completed)"
                fill="var(--assignment-progress-fill)"
                fillOpacity={0.55}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full animate-pulse rounded-xl" style={{ background: "var(--surface-muted)" }} />
        )}
      </div>

      <div className="h-px w-full" style={{ background: "var(--border-subtle)" }} />

      <div className="w-full">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--muted-foreground)" }}
          >
            Achievements
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--assignment-row-cta-bg)", color: "var(--muted-foreground)" }}
          >
            Preview
          </span>
        </div>
        <AchievementBadges count={8} columns={4} />
      </div>
    </div>
  );
}
