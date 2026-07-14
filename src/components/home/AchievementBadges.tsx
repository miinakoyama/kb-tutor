import { Gem, Hexagon, Lock, Sparkles, Star } from "lucide-react";

/**
 * Placeholder achievement badges. No real earned/locked data source exists
 * yet (no badge schema, no unlock rules), so these are clearly labeled as a
 * preview by the caller — do not treat as real student progress.
 */
export const ACHIEVEMENT_BADGES = [
  { label: "First Practice", Icon: Star, earned: true },
  { label: "Explorer", Icon: Gem, earned: true },
  { label: "Keep Going", Icon: Sparkles, earned: true },
  { label: "Rising Star", Icon: Star, earned: true },
  { label: "Streak", Icon: Sparkles, earned: true },
  { label: "Focused", Icon: Gem, earned: true },
  { label: "Champion", Icon: Star, earned: false },
  { label: "Locked", Icon: Lock, earned: false },
] as const;

export function AchievementBadges({
  count,
  columns = 4,
}: {
  /** How many badges to render (from the front of the list). */
  count: number;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {ACHIEVEMENT_BADGES.slice(0, count).map(({ label, Icon, earned }) => (
        <div key={label} className="flex flex-col items-center gap-1 text-center">
          <span className="relative flex h-11 w-11 items-center justify-center">
            <Hexagon
              className="absolute inset-0 h-full w-full"
              style={{
                color: earned ? "var(--assignment-mode-review-bg)" : "var(--surface-muted)",
              }}
              strokeWidth={1.5}
              fill="currentColor"
            />
            <Hexagon
              className="absolute inset-0 h-full w-full"
              style={{ color: earned ? "var(--assignment-mode-review)" : "var(--border-default)" }}
              strokeWidth={1.5}
            />
            <Icon
              className="relative h-4 w-4"
              style={{ color: earned ? "var(--assignment-mode-review)" : "var(--muted-foreground)" }}
            />
          </span>
          <span className="text-[9px] leading-tight text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
