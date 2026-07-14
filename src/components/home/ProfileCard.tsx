"use client";

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
import type { MasteryDatum } from "@/lib/progress/mastery";
import type { StudentProfileSummary } from "@/lib/homepage/profile-summary";
import type { StudentBadgeView } from "@/types/badges";
import { AchievementBadges } from "@/components/home/AchievementBadges";

function initialsOf(name: string | null): string {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Profile card for the homepage right rail. The mastery radar data is
 * computed server-side (`getMasterySummary`) and passed in, so the chart is
 * part of the initial render — this component is a client component only
 * because Recharts needs the DOM.
 */
export function ProfileCard({
  profile,
  mastery,
  badges,
}: {
  profile: StudentProfileSummary;
  mastery: MasteryDatum[];
  badges: StudentBadgeView[];
}) {
  // Recharts' ResponsiveContainer needs a real DOM to measure.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const initials = initialsOf(profile.name);

  return (
    <div
      className="flex h-full flex-col gap-4 rounded-[24px] p-5 sm:p-6"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-card-shadow)",
      }}
    >
      <h3 className="font-heading text-lg font-bold text-heading">Profile</h3>

      <div className="flex flex-col items-center gap-3">
        {/* No avatar image data exists — an initials placeholder derived from
            the real display name (or a neutral icon). */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: "var(--assignment-calendar-nav-bg)" }}
        >
          {initials ? (
            <span
              className="text-2xl font-bold"
              style={{
                color: "var(--assignment-completed)",
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              {initials}
            </span>
          ) : (
            <UserRound
              className="h-9 w-9"
              style={{ color: "var(--assignment-completed)" }}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="text-center">
          {profile.name && (
            <p
              className="font-bold text-heading"
              style={{
                fontSize: 18,
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              {profile.name}
            </p>
          )}
          {profile.schoolName && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {profile.schoolName}
            </p>
          )}
        </div>
      </div>

      <div className="h-px w-full" style={{ background: "var(--border-subtle)" }} />

      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--muted-foreground)" }}
      >
        Topic mastery
      </p>

      {/* Skill radar — the same mastery model as My Progress. The chart
          height is explicit: ResponsiveContainer's percentage height needs a
          definite ancestor height, which this auto-sized card doesn't have. */}
      <div className="h-[240px] w-full">
        {isMounted ? (
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={mastery} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
          <div
            className="h-full w-full animate-pulse rounded-xl"
            style={{ background: "var(--surface-muted)" }}
          />
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
        </div>
        <AchievementBadges badges={badges} count={8} columns={4} />
      </div>
    </div>
  );
}
