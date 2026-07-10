/**
 * OpenAI image generation for short-answer illustration stimuli.
 * Server-side only.
 */

import OpenAI from "openai";
import { getOpenAIKey } from "./env";

/** Per-call hard timeout for image generation (longer than chat). */
const IMAGE_TIMEOUT_MS = 120_000;

export const DEFAULT_ILLUSTRATION_IMAGE_MODEL = "gpt-image-2";

/** Landscape worksheet layout for multi-panel illustrations. */
const DEFAULT_IMAGE_SIZE = "1536x1024";

let _openai: OpenAI | null = null;

function openai(): OpenAI {
  return (_openai ??= new OpenAI({ apiKey: getOpenAIKey() }));
}

export function getIllustrationImageModelId(): string {
  return process.env.ILLUSTRATION_IMAGE_MODEL?.trim() || DEFAULT_ILLUSTRATION_IMAGE_MODEL;
}

function buildIllustrationPrompt(prompt: string): string {
  return [
    "Black and white worksheet-style scientific line illustration on a plain white background.",
    "No color, gradients, or decorative shadows. Clean line art only.",
    "",
    prompt.trim(),
  ].join("\n");
}

export interface IllustrationImageResult {
  imageB64: string;
  modelId: string;
}

export async function generateIllustrationImage(params: {
  prompt: string;
  modelId?: string;
}): Promise<IllustrationImageResult> {
  const modelId = params.modelId ?? getIllustrationImageModelId();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_TIMEOUT_MS);

  try {
    const response = await openai().images.generate(
      {
        model: modelId,
        prompt: buildIllustrationPrompt(params.prompt),
        size: DEFAULT_IMAGE_SIZE,
        quality: "medium",
        n: 1,
      },
      { signal: abort.signal },
    );

    const imageB64 = response.data?.[0]?.b64_json;
    if (!imageB64) {
      throw new Error("Image API returned no b64_json payload");
    }

    return { imageB64, modelId };
  } finally {
    clearTimeout(timer);
  }
}
