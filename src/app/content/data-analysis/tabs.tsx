"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab =
  | "overview"
  | "insights"
  | "students"
  | "questions"
  | "feature-usage";

const TABS: Array<{ id: Tab; label: string; href: string; description: string }> = [
  {
    id: "overview",
    label: "Overview",
    href: "/content/data-analysis",
    description:
      "Pilot monitoring: headline counters, daily trend, device mix, data quality, and per-student engagement.",
  },
  {
    id: "insights",
    label: "Insights",
    href: "/content/data-analysis/insights",
    description:
      "Research-question answers (scaffolding, practice vs exam, routing, completion, calibration).",
  },
  {
    id: "students",
    label: "Student attempts",
    href: "/content/data-analysis/students",
    description: "Row-level attempt log with mode filters and CSV export.",
  },
  {
    id: "questions",
    label: "Question quality",
    href: "/content/data-analysis/questions",
    description: "Per-question accuracy, distractor usage, and mode comparison.",
  },
  {
    id: "feature-usage",
    label: "Feature usage",
    href: "/content/data-analysis/feature-usage",
    description: "Glossary, read-aloud, confidence, and hint scaffolding usage.",
  },
];

export function DataAnalysisTabs() {
  const pathname = usePathname();
  // Longest matching href wins so nested routes light up their own tab.
  const activeId =
    TABS.filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.id ?? "overview";

  return (
    <nav className="border-b border-border-default" aria-label="Data analysis tabs">
      <div className="flex items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              title={tab.description}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "-mb-px whitespace-nowrap border-b-2 border-[var(--assignment-completed)] px-1.5 pb-2.5 pt-1 text-sm font-semibold text-[var(--assignment-completed)] transition-colors"
                  : "-mb-px whitespace-nowrap border-b-2 border-transparent px-1.5 pb-2.5 pt-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
