import type { BktParameters } from "@/types/bkt";

export interface BktStepResult {
  prior: number;
  posterior: number;
  result: number;
  mastered: boolean;
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) throw new Error("BKT probability must be finite");
  return Math.min(1, Math.max(0, value));
}

export function conditionOnResponse(
  priorValue: number,
  correct: boolean,
  parameters: Pick<BktParameters, "guessRate" | "slipRate">,
): number {
  const prior = clampProbability(priorValue);
  const numerator = correct
    ? prior * (1 - parameters.slipRate)
    : prior * parameters.slipRate;
  const denominator = correct
    ? numerator + (1 - prior) * parameters.guessRate
    : numerator + (1 - prior) * (1 - parameters.guessRate);
  if (denominator === 0) return prior;
  return clampProbability(numerator / denominator);
}

export function applyLearningTransition(
  posteriorValue: number,
  learningRate: number,
): number {
  const posterior = clampProbability(posteriorValue);
  const learning = clampProbability(learningRate);
  return clampProbability(posterior + (1 - posterior) * learning);
}

export function applyBktObservation(
  prior: number,
  correct: boolean,
  parameters: Pick<
    BktParameters,
    "guessRate" | "slipRate" | "learningRate" | "masteryThreshold" | "forgettingRate"
  >,
): BktStepResult {
  if (parameters.forgettingRate !== 0) {
    throw new Error("Version 1 supports only no-forgetting BKT");
  }
  const normalizedPrior = clampProbability(prior);
  const posterior = conditionOnResponse(normalizedPrior, correct, parameters);
  const result = applyLearningTransition(posterior, parameters.learningRate);
  return {
    prior: normalizedPrior,
    posterior,
    result,
    mastered: result >= parameters.masteryThreshold,
  };
}

export function replayBkt(
  outcomes: readonly boolean[],
  parameters: Pick<
    BktParameters,
    "initialMastery" | "guessRate" | "slipRate" | "learningRate" | "masteryThreshold" | "forgettingRate"
  >,
): BktStepResult[] {
  const results: BktStepResult[] = [];
  let current = parameters.initialMastery;
  for (const outcome of outcomes) {
    const step = applyBktObservation(current, outcome, parameters);
    results.push(step);
    current = step.result;
  }
  return results;
}
