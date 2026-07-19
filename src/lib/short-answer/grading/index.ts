/**
 * Grading dispatcher: runs the configured method for one part and composes the
 * structured feedback the student sees. Retries once on a transient failure
 * (e.g. malformed JSON); the caller treats a thrown error as "attempt not
 * consumed" (data-model.md state transitions).
 */

import type { PartGradingResult } from "@/types/short-answer";
import { gradeWithMethod1 } from "./method1";
import { gradeWithMethod2 } from "./method2";
import { gradeWithMethod3 } from "./method3";
import { buildGradedFeedback, selectGlossaryTerms } from "./common";
import type { MethodGradeInput, MethodGradeOutput } from "./types";
import type { GradingMethod } from "@/types/short-answer";

async function runMethod(
  method: GradingMethod,
  input: MethodGradeInput,
): Promise<MethodGradeOutput> {
  switch (method) {
    case "1":
      return gradeWithMethod1(input);
    case "2":
      return gradeWithMethod2(input);
    case "3":
      return gradeWithMethod3(input);
  }
}

async function runMethodWithRetry(
  method: GradingMethod,
  input: MethodGradeInput,
): Promise<MethodGradeOutput> {
  try {
    return await runMethod(method, input);
  } catch {
    return runMethod(method, input);
  }
}

export interface GradePartParams extends MethodGradeInput {
  method: GradingMethod;
  /** Attempt number for this submission (1 or 2; exam is always 1). */
  attemptNumber: number;
  /** Max attempts allowed in this mode (2 in practice, 1 in exam). */
  maxAttempts: number;
}

export async function gradePart(
  params: GradePartParams,
): Promise<PartGradingResult> {
  const { method, attemptNumber, maxAttempts, ...input } = params;

  const methodInput: MethodGradeInput = {
    ...input,
    isFinalSubmission: attemptNumber >= maxAttempts,
  };
  const output = await runMethodWithRetry(method, methodInput);

  const correct = output.score >= input.part.maxScore;
  const attemptsRemaining = correct ? 0 : Math.max(0, maxAttempts - attemptNumber);
  const isFinalAttempt = correct || attemptsRemaining === 0;

  const feedback = buildGradedFeedback({
    rawFeedback: output.feedback,
    correct,
    isFinalAttempt,
    item: input.item,
    part: input.part,
    attemptsRemaining,
    studentResponse: input.studentResponse,
  });

  return {
    score: output.score,
    maxScore: input.part.maxScore,
    correct,
    feedback,
    diagnosedGap: output.diagnosedGap,
    confidence: output.confidence,
    tokenCount: output.tokenCount,
    latencyMs: output.latencyMs,
  };
}

export { buildGradedFeedback, selectGlossaryTerms };
export type { MethodGradeInput, MethodGradeOutput } from "./types";
