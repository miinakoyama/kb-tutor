"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, NotebookPen, RotateCcw, type LucideIcon } from "lucide-react";
import { fetchFirstTryIncorrectQuestionIds } from "@/lib/storage";
import { formatTimeSpent } from "@/lib/format-time";

const CARD_STYLE = {
  background: "var(--assignment-glass-bg)",
  border: "1px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-card-shadow)",
  backdropFilter: "blur(14px) saturate(115%)",
  WebkitBackdropFilter: "blur(14px) saturate(115%)",
} as const;

function QuickStartCard({
  Icon,
  iconColor,
  iconBg,
  title,
  children,
  ctaLabel,
  ctaHref,
}: {
  Icon: LucideIcon;
  /** Mode color pair from the design system (`--assignment-mode-*`). */
  iconColor: string;
  iconBg: string;
  title: string;
  children: ReactNode;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl p-4 sm:p-5" style={CARD_STYLE}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: iconBg }}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
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
          style={{ color: "var(--assignment-completed)" }}
        >
          {ctaLabel} →
        </Link>
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
      iconColor="var(--assignment-mode-practice)"
      iconBg="var(--assignment-mode-practice-bg)"
      title="Self-Practice"
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
      iconColor="var(--assignment-mode-review)"
      iconBg="var(--assignment-mode-review-bg)"
      title="Review"
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
