"use client";

import { useId } from "react";
import type { ConfidenceLevel } from "@/types/question";

interface ConfidenceCheckProps {
  value?: ConfidenceLevel;
  onChange: (level: ConfidenceLevel) => void;
}

const LEVELS: { id: ConfidenceLevel; label: string }[] = [
  { id: "not_sure", label: "Not sure" },
  { id: "somewhat", label: "Somewhat" },
  { id: "sure", label: "Sure" },
];

export function ConfidenceCheck({ value, onChange }: ConfidenceCheckProps) {
  const labelId = useId();

  return (
    <div className="pt-3 border-t border-border-subtle">
      <p id={labelId} className="text-sm font-medium text-slate-gray mb-2">
        How confident were you?
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex gap-2"
      >
        {LEVELS.map((level) => {
          const isActive = value === level.id;
          return (
            <button
              key={level.id}
              onClick={() => onChange(level.id)}
              aria-pressed={isActive}
              className={`px-5 py-2 min-h-[44px] text-sm font-medium rounded-xl border-[1.5px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isActive
                  ? "border-[var(--assignment-completed)] bg-[var(--assignment-calendar-nav-bg)] text-[var(--mastery-mastered)]"
                  : "border-[var(--border-default)] bg-surface text-muted-foreground hover:border-[var(--assignment-selectable-border)] hover:text-foreground"
              }`}
            >
              {level.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
