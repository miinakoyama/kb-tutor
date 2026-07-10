import { NextResponse } from "next/server";
import { getRequester } from "@/lib/assignments/manage-helpers";
import { STANDARD_DEFINITIONS } from "@/lib/standards";
import {
  DEFAULT_GENERATION_TEMPERATURE,
  findGenerationModelById,
  isValidTemperature,
} from "@/lib/llm/models";
import { STIMULUS_TYPES } from "@/lib/short-answer/item-schema";
import {
  generateShortAnswerItem,
  GenerationError,
} from "@/lib/short-answer/generation/pipeline";
import type { StimulusType } from "@/types/short-answer";

const STANDARD_IDS = new Set(STANDARD_DEFINITIONS.map((s) => s.id));

interface ParsedBody {
  standardCode: string;
  fixedCoreKC?: string;
  stimulusType?: StimulusType;
  modelId: string;
  temperature: number;
}

function parseBody(raw: unknown): { body?: ParsedBody; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "Malformed request body" };
  const b = raw as Record<string, unknown>;

  if (typeof b.standardCode !== "string" || !STANDARD_IDS.has(b.standardCode)) {
    return { error: "Unknown or missing standardCode" };
  }
  if (typeof b.modelId !== "string" || !findGenerationModelById(b.modelId)) {
    return { error: "Unknown or missing modelId" };
  }

  let fixedCoreKC: string | undefined;
  if (b.fixedCoreKC !== undefined && b.fixedCoreKC !== null) {
    if (typeof b.fixedCoreKC !== "string" || !b.fixedCoreKC.trim()) {
      return { error: "Invalid fixedCoreKC" };
    }
    fixedCoreKC = b.fixedCoreKC.trim();
  }

  let stimulusType: StimulusType | undefined;
  if (b.stimulusType !== undefined && b.stimulusType !== null && b.stimulusType !== "auto") {
    if (
      typeof b.stimulusType !== "string" ||
      !STIMULUS_TYPES.includes(b.stimulusType as StimulusType)
    ) {
      return { error: "Invalid stimulusType" };
    }
    stimulusType = b.stimulusType as StimulusType;
  }

  let temperature = DEFAULT_GENERATION_TEMPERATURE;
  if (b.temperature !== undefined && b.temperature !== null) {
    if (!isValidTemperature(b.temperature)) {
      return { error: "temperature must be a number between 0 and 2" };
    }
    temperature = b.temperature;
  }

  return { body: { standardCode: b.standardCode, fixedCoreKC, stimulusType, modelId: b.modelId, temperature } };
}

export async function POST(request: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { body, error } = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: error ?? "Malformed request body" }, { status: 400 });
  }

  try {
    const { blueprint, item, grounding, metadata } = await generateShortAnswerItem(body);
    return NextResponse.json({ blueprint, item, grounding, metadata });
  } catch (err) {
    if (err instanceof GenerationError) {
      // Input problems the parser couldn't catch (e.g. KC not under standard).
      if (!err.retriable) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      return NextResponse.json(
        { error: "generation_failed", stage: err.stage, retriable: err.retriable },
        { status: 502 },
      );
    }
    console.error("[short-answer/generate] unexpected error", err);
    return NextResponse.json(
      { error: "generation_failed", retriable: true },
      { status: 502 },
    );
  }
}
