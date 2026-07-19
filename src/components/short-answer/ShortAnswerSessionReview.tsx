"use client";

import type {
  GradedFeedback,
  PartLabel,
  ShortAnswerItem,
  ShortAnswerPart,
} from "@/types/short-answer";
import { StimulusPanel } from "@/components/short-answer/StimulusPanel";
import {
  FeedbackBlock,
  ModelAnswerBlock,
} from "@/components/short-answer/FeedbackBlock";
import { partModelAnswer } from "@/lib/short-answer/grading/common";
import {
  buildPartRuntimesFromStoredAttempts,
  type StoredShortAnswerAttempt,
} from "@/lib/short-answer/attempt-state";

export interface ShortAnswerAttemptReview {
  attemptNumber: number;
  responseText: string;
  correct: boolean;
  score: number;
  maxScore: number;
  feedback: GradedFeedback;
}

export interface ShortAnswerPartReview {
  partLabel: PartLabel;
  responseText: string;
  correct: boolean;
  score: number;
  maxScore: number;
  feedback: GradedFeedback | null;
  attempts: ShortAnswerAttemptReview[];
}

export function buildShortAnswerPartReviews(
  parts: ShortAnswerPart[],
  rows: StoredShortAnswerAttempt[],
): ShortAnswerPartReview[] {
  const { runtimes } = buildPartRuntimesFromStoredAttempts(parts, rows);
  return parts.map((part, index) => {
    const runtime = runtimes[index];
    const attempts: ShortAnswerAttemptReview[] = (runtime?.attempts ?? []).map(
      (attempt) => ({
        attemptNumber: attempt.attemptNumber,
        responseText: attempt.responseText,
        correct: attempt.correct,
        score: attempt.score,
        maxScore: attempt.maxScore,
        feedback: attempt.feedback,
      }),
    );
    const latest = attempts[attempts.length - 1];
    const correct = attempts.some((attempt) => attempt.correct);
    return {
      partLabel: part.label,
      responseText: latest?.responseText ?? "",
      correct,
      score: latest?.score ?? (correct ? part.maxScore : 0),
      maxScore: latest?.maxScore ?? part.maxScore,
      feedback: runtime?.latestFeedback ?? latest?.feedback ?? null,
      attempts,
    };
  });
}

interface ShortAnswerSessionReviewProps {
  item: ShortAnswerItem;
  parts: ShortAnswerPartReview[];
  imageLoading?: boolean;
}

export function ShortAnswerSessionReview({
  item,
  parts,
  imageLoading = false,
}: ShortAnswerSessionReviewProps) {
  const partsByLabel = new Map(parts.map((part) => [part.partLabel, part]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <StimulusPanel
          stem={item.stem}
          stimulus={item.stimulus}
          imageLoading={imageLoading}
        />
      </div>
      <div className="flex flex-col gap-4">
        {item.parts.map((part) => {
          const result = partsByLabel.get(part.label);
          const attempts = result?.attempts ?? [];
          const modelAnswer =
            result?.feedback?.modelAnswer?.trim() ||
            attempts
              .map((attempt) => attempt.feedback.modelAnswer?.trim())
              .find((value) => Boolean(value)) ||
            partModelAnswer(item, part);

          return (
            <div
              key={part.label}
              className="rounded-xl border border-border-default bg-surface p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Part {part.label}
                </p>
                {result && attempts.length > 0 ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      result.correct
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {result.correct ? "Correct" : "Incorrect"} · {result.score}/
                    {result.maxScore}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    Not answered
                  </span>
                )}
              </div>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-gray">
                {part.prompt}
              </p>

              {attempts.length === 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No answer submitted for this part.
                  </p>
                  <ModelAnswerBlock modelAnswer={modelAnswer} />
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  {attempts.map((attempt) => (
                    <div
                      key={`${part.label}-${attempt.attemptNumber}`}
                      className="space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Attempt {attempt.attemptNumber}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            attempt.correct
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {attempt.correct ? "Correct" : "Incorrect"} ·{" "}
                          {attempt.score}/{attempt.maxScore}
                        </span>
                      </div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        You wrote
                      </p>
                      <p className="whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm italic text-slate-gray">
                        {attempt.responseText.trim().length > 0
                          ? `“${attempt.responseText}”`
                          : "(no answer)"}
                      </p>
                      {(attempt.feedback.segments.length > 0 ||
                        Boolean(attempt.feedback.modelAnswer)) && (
                        <FeedbackBlock feedback={attempt.feedback} triesLeft={0} />
                      )}
                    </div>
                  ))}
                  {!attempts.some(
                    (attempt) =>
                      attempt.feedback.segments.length > 0 ||
                      Boolean(attempt.feedback.modelAnswer),
                  ) && <ModelAnswerBlock modelAnswer={modelAnswer} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
