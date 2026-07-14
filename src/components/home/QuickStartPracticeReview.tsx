"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ImageIcon } from "lucide-react";
import { fetchFirstTryIncorrectQuestionIds } from "@/lib/storage";
import { formatTimeSpent } from "@/lib/format-time";

const CARD_STYLE = {
  background: "var(--assignment-glass-bg)",
  border: "1px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-card-shadow)",
  backdropFilter: "blur(14px) saturate(115%)",
  WebkitBackdropFilter: "blur(14px) saturate(115%)",
} as const;

function IllustrationSlot({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-[96px] flex-1 items-center justify-center gap-2 rounded-2xl text-xs font-medium"
      style={{
        background: "var(--surface-muted)",
        border: "1px dashed var(--border-default)",
        color: "var(--muted-foreground)",
      }}
      aria-hidden="true"
    >
      <ImageIcon className="h-4 w-4" />
      {label} illustration
    </div>
  );
}

function QuickStartCardShell({
  illustrationLabel,
  title,
  children,
  ctaLabel,
  ctaHref,
}: {
  illustrationLabel: string;
  title: string;
  children: ReactNode;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-[24px] p-4 sm:p-5" style={CARD_STYLE}>
      <IllustrationSlot label={illustrationLabel} />

      <p
        className="font-bold text-slate-gray"
        style={{ fontSize: 17, fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
      >
        {title}
      </p>

      <div className="flex items-center justify-between gap-3">
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
    <QuickStartCardShell
      illustrationLabel="Self-Practice"
      title="Self-Practice"
      ctaLabel="Start"
      ctaHref="/self-practice"
    >
      {weeklySeconds !== null ? (
        <p>{formatTimeSpent(weeklySeconds)} last week</p>
      ) : (
        <p>Practice at your own pace.</p>
      )}
    </QuickStartCardShell>
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

  const isEmpty = count === 0;

  return (
    <QuickStartCardShell
      illustrationLabel="Review"
      title="Review"
      ctaLabel="Review"
      ctaHref="/bookmarks?tab=needs"
    >
      {count === null ? (
        <p>Incorrect questions appear here.</p>
      ) : isEmpty ? (
        <p className="inline-flex items-center gap-1.5">
          <CheckCircle2
            className="h-4 w-4 flex-shrink-0"
            style={{ color: "var(--assignment-completed)" }}
            aria-hidden="true"
          />
          All caught up
        </p>
      ) : (
        <p>
          {count} {count === 1 ? "question" : "questions"} to review
        </p>
      )}
    </QuickStartCardShell>
  );
}
