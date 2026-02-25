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
    <div className="pt-3 border-t border-slate-gray/10">
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
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-150 ${
                isActive
                  ? "border-[#16a34a] bg-[#16a34a]/10 text-[#16a34a]"
                  : "border-slate-gray/20 bg-white text-slate-gray/70 hover:border-slate-gray/40 hover:text-slate-gray"
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
