"use client";

import { PenLine } from "lucide-react";
import type { ShortAnswerItem } from "@/types/short-answer";
import { StimulusPanel } from "@/components/short-answer/StimulusPanel";
import { formatPartRubric, totalShortAnswerPoints } from "@/lib/short-answer/grading/common";

interface ShortAnswerQuestionDetailsProps {
  item: ShortAnswerItem;
  className?: string;
}

/**
 * Read-only short-answer preview for assignment pickers and detail pages.
 */
export function ShortAnswerQuestionDetails({
  item,
  className,
}: ShortAnswerQuestionDetailsProps) {
  const totalPoints = totalShortAnswerPoints(item);

  return (
    <div
      className={`border-t border-border-subtle bg-surface-muted/80 px-3 py-3 space-y-3 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">
          <PenLine className="h-3 w-3" />
          Short Answer
        </span>
        <span className="rounded bg-slate-gray/10 px-2 py-0.5 text-muted-foreground">
          {item.stimulus.type}
        </span>
        <span className="rounded bg-slate-gray/10 px-2 py-0.5 text-muted-foreground">
          {item.parts.length} part{item.parts.length === 1 ? "" : "s"}
        </span>
        <span className="rounded bg-slate-gray/10 px-2 py-0.5 text-muted-foreground">
          {totalPoints} pts total
        </span>
      </div>

      <StimulusPanel stem={item.stem} stimulus={item.stimulus} />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Parts
        </p>
        {item.parts.map((part) => (
          <div
            key={part.label}
            className="rounded-md border border-border-default bg-surface px-3 py-2"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {part.label}
              </span>
              <span className="text-xs text-muted-foreground">{part.taskType}</span>
              <span className="text-xs text-muted-foreground">
                {part.maxScore} pt{part.maxScore === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap text-slate-gray">{part.prompt}</p>
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Part Rubric
            </p>
            <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">
              {formatPartRubric(part)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
