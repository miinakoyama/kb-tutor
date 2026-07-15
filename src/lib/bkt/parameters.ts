import type { BktParameters, QuestionFormat } from "@/types/bkt";
import { MCQ_PARAMETERS, SAQ_PARAMETERS } from "@/lib/bkt/fixtures";

export const V1_PARAMETER_VERSION = "bkt-v1-no-forgetting";

export function defaultBktParameters(format: QuestionFormat): BktParameters {
  const values = format === "mcq" ? MCQ_PARAMETERS : SAQ_PARAMETERS;
  return {
    id: `default-${format}-v1`,
    version: V1_PARAMETER_VERSION,
    format,
    ...values,
    active: true,
  };
}

export function validateBktParameters(parameters: BktParameters): string[] {
  const errors: string[] = [];
  for (const [name, value] of [
    ["initialMastery", parameters.initialMastery],
    ["learningRate", parameters.learningRate],
    ["guessRate", parameters.guessRate],
    ["slipRate", parameters.slipRate],
    ["masteryThreshold", parameters.masteryThreshold],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`${name} must be between 0 and 1`);
  }
  if (parameters.forgettingRate !== 0) errors.push("forgettingRate must be 0 in version 1");
  return errors;
}
