"use client";

import { useState } from "react";
import { Award, Lock } from "lucide-react";
import type { StudentBadgeView } from "@/types/badges";

function BadgeIcon({ icon, earned }: { icon: string; earned: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    const FallbackIcon = earned ? Award : Lock;
    return (
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: "var(--surface-muted)" }}
      >
        <FallbackIcon
          className="h-5 w-5"
          style={{ color: earned ? "var(--assignment-mode-review)" : "var(--muted-foreground)" }}
        />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- badge art is a small, unoptimized fixed-size icon
    <img
      src={`/badges/${icon}`}
      alt=""
      className="h-11 w-11 object-contain"
      style={{ opacity: earned ? 1 : 0.35, filter: earned ? undefined : "grayscale(1)" }}
      onError={() => setImageFailed(true)}
    />
  );
}

export function AchievementBadges({
  badges,
  count,
  columns = 4,
}: {
  badges: StudentBadgeView[];
  /** How many badges to render (from the front of the list). */
  count: number;
  columns?: number;
}) {
  const sorted = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned));

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {sorted.slice(0, count).map(({ id, name, icon, earned }) => (
        <div key={id} className="flex flex-col items-center gap-1 text-center">
          <BadgeIcon icon={icon} earned={earned} />
          <span className="text-[9px] leading-tight text-muted-foreground">{name}</span>
        </div>
      ))}
    </div>
  );
}
