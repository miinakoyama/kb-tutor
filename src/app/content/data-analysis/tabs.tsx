"use client";

import Link from "next/link";

export type Tab =
  | "overview"
  | "insights"
  | "students"
  | "questions"
  | "feature-usage";

interface DataAnalysisTabsProps {
  active: Tab;
}

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

export function DataAnalysisTabs({ active }: DataAnalysisTabsProps) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1 rounded-lg border border-[#16a34a]/20 bg-white p-1 shadow-sm">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            title={tab.description}
            className={
              isActive
                ? "rounded-md bg-[#16a34a] px-4 py-2 text-sm font-medium text-white"
                : "rounded-md px-4 py-2 text-sm font-medium text-slate-gray hover:bg-green-50 hover:text-[#166534]"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
