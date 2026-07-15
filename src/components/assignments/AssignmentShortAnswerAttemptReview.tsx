"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { Question } from "@/types/question";
import type { AssignmentShortAnswerAnswer } from "@/lib/assignments/history";
import { StimulusPanel } from "@/components/short-answer/StimulusPanel";
import { FeedbackBlock } from "@/components/short-answer/FeedbackBlock";

interface AssignmentShortAnswerAttemptReviewProps {
  question: Question;
  answer: AssignmentShortAnswerAnswer;
}

export function AssignmentShortAnswerAttemptReview({
  question,
  answer,
}: AssignmentShortAnswerAttemptReviewProps) {
  const item = question.shortAnswer;
  if (!item) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
        Short Answer
      </div>

      <StimulusPanel
        stem={item.stem}
        stimulus={item.stimulus}
      />

      <div className="space-y-4">
        {item.parts.map((part) => {
          const partAnswer = answer.parts.find((entry) => entry.partLabel === part.label);
          const attempts = partAnswer?.attempts ?? [];
          const resolved =
            partAnswer?.isCorrect ||
            attempts.length >= 2 ||
            attempts.some((attempt) => attempt.isCorrect);

          return (
            <section
              key={part.label}
              className="rounded-xl border border-border-default bg-surface p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                  {part.label}
                </span>
                <span className="text-xs text-muted-foreground">{part.taskType}</span>
                {partAnswer ? (
                  partAnswer.isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Correct" />
                  ) : resolved ? (
                    <XCircle className="h-4 w-4 text-red-400" aria-label="Incorrect" />
                  ) : null
                ) : null}
              </div>

              <p className="mb-3 text-sm font-medium text-slate-gray whitespace-pre-wrap">
                {part.prompt}
              </p>

              {attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No answer submitted for this part.</p>
              ) : (
                <div className="space-y-3">
                  {attempts.map((attempt) => (
                    <div key={`${part.label}-${attempt.attemptNumber}`} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Attempt {attempt.attemptNumber}
                      </p>
                      <div className="rounded-lg border border-border-default bg-surface-muted px-3 py-2.5">
                        <p className="text-sm whitespace-pre-wrap text-slate-gray">
                          {attempt.responseText}
                        </p>
                      </div>
                      <FeedbackBlock
                        feedback={attempt.feedback}
                        triesLeft={0}
                        isFinalAttempt={
                          attempt.isCorrect ||
                          attempt.attemptNumber >= 2 ||
                          attempts.length >= 2
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
