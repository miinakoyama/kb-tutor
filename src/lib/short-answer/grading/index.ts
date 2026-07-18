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
import { buildAttempt2StudentFeedback, generateAttempt2Feedback } from "./attempt2";
import { buildGradedFeedback, partFullCreditCriteria, selectGlossaryTerms } from "./common";
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
  /** Plain-text feedback from attempt 1 (required for attempt-2 closure feedback). */
  attempt1Feedback?: string;
  /** Diagnosed gap from attempt 1 (required for attempt-2 resolution classification). */
  attempt1Gap?: string;
}

export async function gradePart(
  params: GradePartParams,
): Promise<PartGradingResult> {
  const {
    method,
    attemptNumber,
    maxAttempts,
    attempt1Feedback = "",
    attempt1Gap = "",
    ...input
  } = params;

  const output = await runMethodWithRetry(method, input);
  let tokenCount = output.tokenCount;
  let latencyMs = output.latencyMs;
  let studentFeedback = output.feedback;

  const correct = output.score >= input.part.maxScore;
  const attemptsRemaining = correct ? 0 : Math.max(0, maxAttempts - attemptNumber);
  const isFinalAttempt = correct || attemptsRemaining === 0;

  if (!correct && isFinalAttempt) {
    if (attemptNumber === 2 && maxAttempts > 1) {
      // Real second attempt: classify how well it resolves attempt 1's gap.
      const attempt2 = await buildAttempt2StudentFeedback({
        attempt1Feedback,
        attempt1Gap,
        fullCreditCriteria: partFullCreditCriteria(input.part),
        itemStem: input.item.stem,
        partLabel: input.part.label,
        partPrompt: input.part.prompt,
        studentResponse: input.studentResponse,
        modelId: input.modelId,
        temperature: input.temperature,
        fallbackGap: output.diagnosedGap,
      });
      studentFeedback = attempt2.feedback;
      tokenCount += attempt2.tokenCount;
      latencyMs += attempt2.latencyMs;
    } else {
      // Exam mode's single attempt has no real attempt 1 to compare against,
      // so skip resolution classification and go straight to declarative
      // closure feedback for the gap this grading pass just diagnosed.
      const closure = await generateAttempt2Feedback({
        resolution: "not_at_all",
        attempt1Feedback: "",
        attempt1Gap: output.diagnosedGap?.trim() || partFullCreditCriteria(input.part),
        fullCreditCriteria: partFullCreditCriteria(input.part),
        questionStem: input.item.stem,
        partLabel: input.part.label,
        partPrompt: input.part.prompt,
        studentResponse: input.studentResponse,
        modelId: input.modelId,
        temperature: input.temperature,
      });
      studentFeedback = closure.feedback;
      tokenCount += closure.tokenCount;
      latencyMs += closure.latencyMs;
    }
  }

  const feedback = buildGradedFeedback({
    rawFeedback: studentFeedback,
    correct,
    isFinalAttempt,
    item: input.item,
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
    tokenCount,
    latencyMs,
  };
}

export { buildGradedFeedback, selectGlossaryTerms };
export type { MethodGradeInput, MethodGradeOutput } from "./types";
