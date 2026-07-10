/**
 * Model catalogs for short-answer generation and grading.
 * IDs match the reference project's live model identifiers (research R13).
 * Stored settings reference catalog IDs and are validated on write.
 */

import type { GradingMethod } from "@/types/short-answer";

export interface LLMModelInfo {
  /** Provider model identifier passed to chatComplete. */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  provider: "openai" | "anthropic" | "google";
}

export const GENERATION_MODELS: LLMModelInfo[] = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "anthropic" },
  { id: "gpt-5.4", label: "GPT 5.4", provider: "openai" },
  { id: "gpt-5.4-mini", label: "GPT 5.4 mini", provider: "openai" },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    provider: "google",
  },
];

export const DEFAULT_GENERATION_MODEL_ID = "gpt-5.4";
export const DEFAULT_GENERATION_TEMPERATURE = 1;

export const GRADING_MODELS: LLMModelInfo[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "gpt-5.4", label: "GPT 5.4", provider: "openai" },
  { id: "gpt-5.4-mini", label: "GPT 5.4 mini", provider: "openai" },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    provider: "google",
  },
];

export interface MethodDefaults {
  modelId: string;
  temperature: number;
}

/** Recommended defaults per grading method (spec FR-025). */
export const METHOD_RECOMMENDED_DEFAULTS: Record<GradingMethod, MethodDefaults> = {
  "1": { modelId: "claude-opus-4-8", temperature: 1 },
  "2": { modelId: "gpt-5.4", temperature: 1 },
  "3": { modelId: "claude-sonnet-4-6", temperature: 0 },
};

export const METHOD_LABELS: Record<GradingMethod, string> = {
  "1": "Method 1 — Single-call grading with knowledge-base context",
  "2": "Method 2 — Two-stage (score, then feedback)",
  "3": "Method 3 — Error-analysis-first with boundary examples",
};

export function findGenerationModelById(id: string): LLMModelInfo | null {
  return GENERATION_MODELS.find((model) => model.id === id) ?? null;
}

export function findGradingModelById(id: string): LLMModelInfo | null {
  return GRADING_MODELS.find((model) => model.id === id) ?? null;
}

export function isGradingMethod(value: unknown): value is GradingMethod {
  return value === "1" || value === "2" || value === "3";
}

export function isValidTemperature(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 2
  );
}
