"use client";

import { useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Award, UserRound } from "lucide-react";
import type { MasteryDatum } from "@/lib/progress/mastery";
import type { StudentProfileSummary } from "@/lib/homepage/profile-summary";
import type { StudentBadgeView } from "@/types/badges";
import { BadgeModal } from "./BadgeModal";

function MasteryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MasteryDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const { fullTopic, masteryValue } = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-popover-shadow)",
      }}
    >
      <p className="font-semibold text-slate-gray">{fullTopic}</p>
      <p className="mt-0.5 text-muted-foreground">{masteryValue}% mastery</p>
    </div>
  );
}

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
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);

  const initials = initialsOf(profile.name);
  const earnedBadgeCount = badges.filter((badge) => badge.earned).length;

  return (
    <div
      className="flex h-full flex-col gap-4 rounded-[24px] p-5 sm:p-6"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-card-shadow)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-lg font-bold text-slate-gray">Profile</h3>
        <button
          type="button"
          onClick={() => setIsBadgeModalOpen(true)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition hover:brightness-95"
          style={{
            background: "var(--mastery-mastered-bg)",
            color: "var(--mastery-mastered)",
          }}
        >
          <Award className="h-3.5 w-3.5" aria-hidden="true" />
          Badges
          <span className="opacity-70">
            {earnedBadgeCount}/{badges.length}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* No avatar image data exists — an initials placeholder derived from
            the real display name (or a neutral icon). */}
        <div
          className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--assignment-calendar-nav-bg)" }}
        >
          {initials ? (
            <span
              className="text-xl font-bold"
              style={{
                color: "var(--assignment-completed)",
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              {initials}
            </span>
          ) : (
            <UserRound
              className="h-8 w-8"
              style={{ color: "var(--assignment-completed)" }}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="min-w-0">
          {profile.name && (
            <p
              className="truncate font-bold text-heading"
              style={{
                fontSize: 18,
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              {profile.name}
            </p>
          )}
          {profile.schoolName && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
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

      {/* Skill radar. The chart height is explicit: ResponsiveContainer's
          percentage height needs a definite ancestor height, which this
          auto-sized card doesn't have. */}
      <div className="h-[280px] w-full">
        {isMounted ? (
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart
              data={mastery}
              outerRadius="85%"
              margin={{ top: 10, right: 20, bottom: 10, left: 90 }}
            >
              <PolarGrid stroke="var(--assignment-completed)" strokeOpacity={0.2} />
              <PolarAngleAxis
                dataKey="topic"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Tooltip content={<MasteryTooltip />} />
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

      {isBadgeModalOpen && (
        <BadgeModal
          studentName={profile.name}
          badges={badges}
          onClose={() => setIsBadgeModalOpen(false)}
        />
      )}
    </div>
  );
}
