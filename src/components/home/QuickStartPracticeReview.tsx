"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, NotebookPen, RotateCcw, type LucideIcon } from "lucide-react";
import { fetchFirstTryIncorrectQuestionIds } from "@/lib/storage";
import { formatTimeSpent } from "@/lib/format-time";

/**
 * Practice tile: white surface with a colored border and matching icon/title
 * accent. `accent` / `tint` are a design-system mode-color pair
 * (`--assignment-mode-*`).
 */
function QuickStartCard({
  Icon,
  accent,
  tint,
  borderColor,
  title,
  children,
  ctaLabel,
  ctaHref,
}: {
  Icon: LucideIcon;
  accent: string;
  tint: string;
  borderColor: string;
  title: string;
  children: ReactNode;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    // Outer colored frame; the inner white card sits on it with a shadow so
    // it reads as a card cushioned inside the frame.
    <div
      className="h-full rounded-[24px] p-1.5"
      style={{ background: borderColor }}
    >
      <div
        className="flex h-full flex-col gap-3 rounded-[18px] p-4 sm:p-5"
        style={{
          background: "var(--surface)",
          boxShadow: "var(--assignment-card-shadow)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: tint }}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" style={{ color: accent }} />
          </span>
          <p
            className="font-bold text-slate-gray"
            style={{ fontSize: 17, fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
          >
            {title}
          </p>
        </div>

        <div className="flex flex-1 items-end justify-between gap-3">
          <div className="text-sm text-muted-foreground">{children}</div>
          <Link
            href={ctaHref}
            className="flex-shrink-0 text-sm font-semibold transition hover:brightness-110"
            style={{ color: accent }}
          >
            {ctaLabel} →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SelfPracticeQuickStartCard({
  weeklySeconds,
}: {
  weeklySeconds: number | null;
}) {
  return (
    <QuickStartCard
      Icon={NotebookPen}
      accent="var(--assignment-mode-practice)"
      tint="var(--assignment-mode-practice-bg)"
      borderColor="#EDF2FA"
      title="Practice a topic"
      ctaLabel="Start practicing"
      ctaHref="/self-practice"
    >
      <p>Practice at your own pace.</p>
      {weeklySeconds !== null && weeklySeconds > 0 && (
        <p className="mt-0.5 text-xs">
          {formatTimeSpent(weeklySeconds)} in the last 7 days
        </p>
      )}
    </QuickStartCard>
  );
}

export function ReviewQuickStartCard() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFirstTryIncorrectQuestionIds().then((ids) => {
      if (!cancelled) setCount(ids.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QuickStartCard
      Icon={RotateCcw}
      accent="var(--assignment-mode-review)"
      tint="var(--assignment-mode-review-bg)"
      borderColor="#FBF2DC"
      title="Review mistakes"
      ctaLabel="Review"
      ctaHref="/bookmarks?tab=needs"
    >
      <p>Revisit questions you got wrong.</p>
      {count !== null &&
        (count === 0 ? (
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs">
            <CheckCircle2
              className="h-3.5 w-3.5 flex-shrink-0"
              style={{ color: "var(--assignment-completed)" }}
              aria-hidden="true"
            />
            All caught up
          </p>
        ) : (
          <p className="mt-0.5 text-xs">
            {count} {count === 1 ? "question" : "questions"} to review
          </p>
        ))}
    </QuickStartCard>
  );
}
