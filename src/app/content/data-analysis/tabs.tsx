"use client";

import Link from "next/link";

type Tab = "insights" | "students" | "questions" | "feature-usage";

interface DataAnalysisTabsProps {
  active: Tab;
}

const TABS: Array<{ id: Tab; label: string; href: string; description: string }> = [
  {
    id: "insights",
    label: "Insights",
    href: "/content/data-analysis/insights",
    description: "Research-question answers at a glance (scaffolding, practice vs exam, routing, completion).",
  },
  {
    id: "students",
    label: "Student attempts",
    href: "/content/data-analysis",
    description: "Row-level attempt log with school/student/mode filters.",
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
