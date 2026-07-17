import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseGeneratedQuestions } from "@/lib/gemini";
import { chatComplete } from "@/lib/llm/client";
import {
  DEFAULT_GENERATION_MODEL_ID,
  DEFAULT_GENERATION_TEMPERATURE,
  findGenerationModelById,
  isValidTemperature,
} from "@/lib/llm/models";
import { buildGenerationPrompt } from "@/lib/prompts";
import type { Question, DOKLevel } from "@/types/question";
import type { StimulusType } from "@/types/short-answer";
import { getAllStandards, getStandardById } from "@/lib/standards";
import { normalizeQuestionGlossaryTerms } from "@/lib/glossary";
import { getKCsByStandard, type KC } from "@/lib/short-answer/generation/data";
import { STIMULUS_TYPES } from "@/lib/short-answer/item-schema";
import { generateIllustrationImage } from "@/lib/llm/images";

interface GenerationSettings {
  questionSetName: string;
  questionCount: number;
  topics: string[];
  standards: string[];
  standardCounts?: Record<string, number>;
  dokLevels: DOKLevel[];
  includeDiagrams: boolean;
  diagramConfig?: {
    chart: number;
    table: number;
    flowchart: number;
    diagram: number;
  };
  customPrompt: string;
  generationModelId?: string;
  generationTemperature?: number;
  stimulusType?: StimulusType;
  fixedCoreKC?: string;
  fixedCoreKCStatement?: string;
}

const MAX_GENERATION_ATTEMPTS = 5;
const SHOULD_LOG_PROMPT = process.env.LOG_GENERATION_PROMPT === "true";
const FALLBACK_STANDARD = getAllStandards()[0];

function resolveStandardCounts(settings: GenerationSettings): Record<string, number> {
  if (settings.standards.length === 0) return {};
  const raw = settings.standardCounts ?? {};
  const normalized: Record<string, number> = {};
  let total = 0;
  for (const standardId of settings.standards) {
    const value = raw[standardId];
    const count =
      typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : 0;
    normalized[standardId] = count;
    total += count;
  }
  if (total === settings.questionCount) return normalized;

  const base = Math.floor(settings.questionCount / settings.standards.length);
  let remainder = settings.questionCount % settings.standards.length;
  const distributed: Record<string, number> = {};
  for (const standardId of settings.standards) {
    distributed[standardId] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return distributed;
}

function validateSettings(settings: unknown): settings is GenerationSettings {
  if (!settings || typeof settings !== "object") return false;
  
  const s = settings as Record<string, unknown>;

  if (typeof s.questionSetName !== "string" || s.questionSetName.trim().length === 0) {
    return false;
  }
  
  if (typeof s.questionCount !== "number" || s.questionCount < 1 || s.questionCount > 20) {
    return false;
  }
  
  if (!Array.isArray(s.topics) || s.topics.length === 0) {
    return false;
  }

  if (!Array.isArray(s.standards) || s.standards.length === 0) {
    return false;
  }
  if (!s.standards.every((standardId) => typeof standardId === "string")) {
    return false;
  }
  if (!s.standards.every((standardId) => getStandardById(standardId) !== undefined)) {
    return false;
  }
  
  if (!Array.isArray(s.dokLevels) || s.dokLevels.length === 0) {
    return false;
  }

  if (typeof s.includeDiagrams !== "boolean") {
    return false;
  }

  if (s.stimulusType !== undefined) {
    if (
      typeof s.stimulusType !== "string" ||
      !STIMULUS_TYPES.includes(s.stimulusType as StimulusType)
    ) {
      return false;
    }
  }

  if (
    s.diagramConfig !== undefined &&
    (!s.diagramConfig || typeof s.diagramConfig !== "object")
  ) {
    return false;
  }

  const dc = (s.diagramConfig ?? {
    chart: 0,
    table: 0,
    flowchart: 0,
    diagram: 0,
  }) as Record<string, unknown>;
  const diagramKeys = ["chart", "table", "flowchart", "diagram"] as const;
  for (const key of diagramKeys) {
    if (typeof dc[key] !== "number" || (dc[key] as number) < 0) {
      return false;
    }
  }

  const requestedDiagramTotal =
    (dc.chart as number) +
    (dc.table as number) +
    (dc.flowchart as number) +
    (dc.diagram as number);
  if (!s.stimulusType && requestedDiagramTotal > (s.questionCount as number)) {
    return false;
  }

  if (s.standardCounts !== undefined) {
    if (!s.standardCounts || typeof s.standardCounts !== "object") {
      return false;
    }
    const standardCounts = s.standardCounts as Record<string, unknown>;
    const standardIdSet = new Set<string>(s.standards as string[]);
    let providedTotal = 0;
    for (const [standardId, value] of Object.entries(standardCounts)) {
      if (!standardIdSet.has(standardId)) return false;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        return false;
      }
      providedTotal += value;
    }
    if (providedTotal > 0 && providedTotal !== (s.questionCount as number)) {
      return false;
    }
  }

  if (
    s.generationModelId !== undefined &&
    (typeof s.generationModelId !== "string" || !findGenerationModelById(s.generationModelId))
  ) {
    return false;
  }

  if (
    s.generationTemperature !== undefined &&
    !isValidTemperature(s.generationTemperature)
  ) {
    return false;
  }

  if (s.fixedCoreKC !== undefined && typeof s.fixedCoreKC !== "string") {
    return false;
  }
  
  return true;
}

function pickKC(settings: GenerationSettings): KC | null {
  if (settings.standards.length !== 1) return null;
  const standardKCs = getKCsByStandard(settings.standards[0]);
  if (standardKCs.length === 0) return null;
  if (settings.fixedCoreKC) {
    return standardKCs.find((kc) => kc.code === settings.fixedCoreKC) ?? null;
  }
  return standardKCs[Math.floor(Math.random() * standardKCs.length)];
}

async function generateWithSelectedModel(
  prompt: string,
  modelId: string,
  temperature: number,
): Promise<{ text: string; modelId: string; modelLabel: string }> {
  const model = findGenerationModelById(modelId);
  if (!model) {
    throw new Error(`Unknown generation model: ${modelId}`);
  }
  if (model.provider === "google" && modelId === "gemini-3.1-flash-lite-preview") {
    return generateWithGemini(prompt);
  }

  const result = await chatComplete({
    model: modelId,
    temperature,
    maxTokens: 12288,
    messages: [
      {
        role: "system",
        content:
          "You generate standards-aligned biology multiple-choice questions. Return only a JSON array.",
      },
      { role: "user", content: prompt },
    ],
  });
  return { text: result.content, modelId, modelLabel: model.label };
}

function validateQuestion(
  q: unknown,
  index: number,
  allowedStandardIds: Set<string>,
  selectedKC: KC | null,
  generatedImageUrl?: string,
): Question | null {
  if (!q || typeof q !== "object") return null;
  
  const question = q as Record<string, unknown>;
  
  const requiredFields = ["text", "options", "correctOptionId"];
  for (const field of requiredFields) {
    if (!question[field]) {
      console.warn(`Question ${index} missing field: ${field}`);
      return null;
    }
  }
  
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    console.warn(`Question ${index} has invalid options`);
    return null;
  }
  
  const timestamp = Date.now();
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const fallbackStandardId =
    Array.from(allowedStandardIds)[0] ?? FALLBACK_STANDARD?.id;
  const standardIdRaw = typeof question.standardId === "string" ? question.standardId : "";
  const validStandard =
    allowedStandardIds.has(standardIdRaw) ? getStandardById(standardIdRaw) : undefined;
  const fallbackStandard =
    (fallbackStandardId ? getStandardById(fallbackStandardId) : undefined) ??
    FALLBACK_STANDARD;
  const selectedStandard = validStandard ?? fallbackStandard;
  const topicFromStandard = selectedStandard?.category ?? "general-biology";
  const topicSlug = topicFromStandard
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 20);
  const moduleFromStandard = selectedStandard?.module === "B" ? 2 : 1;
  const generatedKcCode =
    selectedKC?.code ??
    (typeof question.kcCode === "string" ? question.kcCode.trim() : "");
  const validGeneratedKc = getKCsByStandard(selectedStandard.id).find(
    (kc) => kc.code === generatedKcCode,
  );
  if (!validGeneratedKc) {
    console.warn(
      `Question ${index} is missing a valid KC for standard ${selectedStandard.id}`,
    );
    return null;
  }
  const { inlineTerms, sidebarTerms } = normalizeQuestionGlossaryTerms(
    question.inlineTerms,
    question.sidebarTerms,
    `${topicSlug}-${index + 1}`,
  );
  
  return {
    id: `generated-${topicSlug}-${timestamp}-${String(index + 1).padStart(3, "0")}-${uniqueSuffix}`,
    module: moduleFromStandard,
    topic: topicFromStandard,
    standardId: selectedStandard?.id,
    standardLabel:
      (typeof question.standardLabel === "string" ? question.standardLabel : undefined) ||
      selectedStandard?.label,
    text: question.text as string,
    imageUrl: generatedImageUrl ?? null,
    options: question.options as Question["options"],
    correctOptionId: question.correctOptionId as string,
    focusHint: (question.focusHint as string) || undefined,
    keyKnowledge: (question.keyKnowledge as string) || undefined,
    kcCode: validGeneratedKc.code,
    kcStatement: validGeneratedKc.statement,
    commonMisconception: (question.commonMisconception as string) || undefined,
    inlineTerms,
    sidebarTerms,
    rationaleQuestion: question.rationaleQuestion as Question["rationaleQuestion"],
    source: "generated",
    dok: (question.dok as DOKLevel) || 2,
    isVisible: true,
    includeInSelfPractice: true,
    generatedAt: new Date().toISOString(),
    diagram: question.diagram as Question["diagram"],
  };
}

function getDiagramDistributionSummary(questions: Question[]) {
  const summary = {
    chart: 0,
    table: 0,
    flowchart: 0,
    diagram: 0,
    textOnly: 0,
  };

  for (const question of questions) {
    if (!question.diagram) {
      summary.textOnly++;
      continue;
    }

    if (question.diagram.type === "chart") summary.chart++;
    if (question.diagram.type === "table") summary.table++;
    if (question.diagram.type === "flowchart") summary.flowchart++;
    if (question.diagram.type === "diagram") summary.diagram++;
  }

  return summary;
}

function hasExactDiagramDistribution(
  questions: Question[],
  settings: GenerationSettings
): { ok: boolean; error?: string } {
  if (questions.length !== settings.questionCount) {
    return {
      ok: false,
      error: `Expected exactly ${settings.questionCount} questions, but got ${questions.length}.`,
    };
  }

  const expected = settings.includeDiagrams
    ? (settings.diagramConfig ?? { chart: 0, table: 0, flowchart: 0, diagram: 0 })
    : { chart: 0, table: 0, flowchart: 0, diagram: 0 };
  const expectedTextOnly =
    settings.questionCount -
    (expected.chart + expected.table + expected.flowchart + expected.diagram);

  const actual = getDiagramDistributionSummary(questions);

  const exactMatch =
    actual.chart === expected.chart &&
    actual.table === expected.table &&
    actual.flowchart === expected.flowchart &&
    actual.diagram === expected.diagram &&
    actual.textOnly === expectedTextOnly;

  if (exactMatch) return { ok: true };

  return {
    ok: false,
    error: `Diagram distribution mismatch. Expected chart=${expected.chart}, table=${expected.table}, flowchart=${expected.flowchart}, diagram=${expected.diagram}, textOnly=${expectedTextOnly}; got chart=${actual.chart}, table=${actual.table}, flowchart=${actual.flowchart}, diagram=${actual.diagram}, textOnly=${actual.textOnly}.`,
  };
}

function hasExpectedStimulus(
  questions: Question[],
  stimulusType: StimulusType,
): { ok: boolean; error?: string } {
  if (questions.length !== 1) {
    return { ok: false, error: `Expected exactly 1 question, got ${questions.length}.` };
  }
  const question = questions[0];
  if (stimulusType === "scenario") {
    return !question.diagram
      ? { ok: true }
      : { ok: false, error: "Expected a text-only scenario with diagram=null." };
  }
  if (stimulusType === "table") {
    return question.diagram?.type === "table"
      ? { ok: true }
      : { ok: false, error: "Expected a table stimulus." };
  }
  if (stimulusType === "line_graph") {
    return question.diagram?.type === "chart" &&
      question.diagram.data &&
      "chartType" in question.diagram.data &&
      question.diagram.data.chartType === "line"
      ? { ok: true }
      : { ok: false, error: "Expected a line graph stimulus." };
  }
  if (stimulusType === "bar_chart") {
    return question.diagram?.type === "chart" &&
      question.diagram.data &&
      "chartType" in question.diagram.data &&
      question.diagram.data.chartType === "bar"
      ? { ok: true }
      : { ok: false, error: "Expected a bar chart stimulus." };
  }
  if (stimulusType === "illustration") {
    return question.imageUrl
      ? { ok: true }
      : { ok: false, error: "Expected an illustration image." };
  }
  return question.diagram?.type === "diagram"
    ? { ok: true }
    : { ok: false, error: `Expected a ${stimulusType} SVG stimulus.` };
}

function tryNormalizeDiagramDistribution(
  questions: Question[],
  settings: GenerationSettings
): { ok: true; questions: Question[] } | { ok: false; reason: string } {
  const expected = settings.includeDiagrams
    ? (settings.diagramConfig ?? { chart: 0, table: 0, flowchart: 0, diagram: 0 })
    : { chart: 0, table: 0, flowchart: 0, diagram: 0 };
  const expectedTextOnly =
    settings.questionCount -
    (expected.chart + expected.table + expected.flowchart + expected.diagram);

  const byType = {
    chart: questions.filter((q) => q.diagram?.type === "chart"),
    table: questions.filter((q) => q.diagram?.type === "table"),
    flowchart: questions.filter((q) => q.diagram?.type === "flowchart"),
    diagram: questions.filter((q) => q.diagram?.type === "diagram"),
    textOnly: questions.filter((q) => !q.diagram),
  };

  if (byType.chart.length < expected.chart) {
    return { ok: false, reason: `Not enough chart questions (${byType.chart.length}/${expected.chart}).` };
  }
  if (byType.table.length < expected.table) {
    return { ok: false, reason: `Not enough table questions (${byType.table.length}/${expected.table}).` };
  }
  if (byType.flowchart.length < expected.flowchart) {
    return {
      ok: false,
      reason: `Not enough flowchart questions (${byType.flowchart.length}/${expected.flowchart}).`,
    };
  }
  if (byType.diagram.length < expected.diagram) {
    return {
      ok: false,
      reason: `Not enough diagram questions (${byType.diagram.length}/${expected.diagram}).`,
    };
  }
  if (byType.textOnly.length < expectedTextOnly) {
    return {
      ok: false,
      reason: `Not enough text-only questions (${byType.textOnly.length}/${expectedTextOnly}).`,
    };
  }

  const normalized = [
    ...byType.chart.slice(0, expected.chart),
    ...byType.table.slice(0, expected.table),
    ...byType.flowchart.slice(0, expected.flowchart),
    ...byType.diagram.slice(0, expected.diagram),
    ...byType.textOnly.slice(0, expectedTextOnly),
  ].slice(0, settings.questionCount);

  if (normalized.length !== settings.questionCount) {
    return {
      ok: false,
      reason: `Normalization produced ${normalized.length}/${settings.questionCount} questions.`,
    };
  }

  return { ok: true, questions: normalized };
}

function getStandardDistributionSummary(
  questions: Question[],
  standardIds: string[]
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const standardId of standardIds) {
    summary[standardId] = 0;
  }
  for (const question of questions) {
    if (!question.standardId) continue;
    if (summary[question.standardId] !== undefined) {
      summary[question.standardId] += 1;
    }
  }
  return summary;
}

function hasExactStandardDistribution(
  questions: Question[],
  settings: GenerationSettings
): { ok: boolean; error?: string } {
  const expected = resolveStandardCounts(settings);
  const actual = getStandardDistributionSummary(questions, settings.standards);

  const mismatches = settings.standards
    .filter((standardId) => (actual[standardId] ?? 0) !== (expected[standardId] ?? 0))
    .map(
      (standardId) =>
        `${standardId}: expected ${(expected[standardId] ?? 0)}, got ${(actual[standardId] ?? 0)}`
    );

  if (mismatches.length === 0) return { ok: true };
  return {
    ok: false,
    error: `Standard distribution mismatch. ${mismatches.join("; ")}`,
  };
}

function tryNormalizeStandardDistribution(
  questions: Question[],
  settings: GenerationSettings
): { ok: true; questions: Question[] } | { ok: false; reason: string } {
  const expected = resolveStandardCounts(settings);
  const buckets: Record<string, Question[]> = {};
  for (const standardId of settings.standards) {
    buckets[standardId] = questions.filter((q) => q.standardId === standardId);
  }

  for (const standardId of settings.standards) {
    const need = expected[standardId] ?? 0;
    if ((buckets[standardId]?.length ?? 0) < need) {
      return {
        ok: false,
        reason: `Not enough questions for standard ${standardId} (${buckets[standardId]?.length ?? 0}/${need}).`,
      };
    }
  }

  const normalized = settings.standards.flatMap((standardId) =>
    (buckets[standardId] ?? []).slice(0, expected[standardId] ?? 0)
  );

  if (normalized.length !== settings.questionCount) {
    return {
      ok: false,
      reason: `Standard normalization produced ${normalized.length}/${settings.questionCount} questions.`,
    };
  }

  return { ok: true, questions: normalized };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!validateSettings(body)) {
      return NextResponse.json(
        { error: "Invalid settings provided" },
        { status: 400 }
      );
    }

    const selectedKC = pickKC(body);
    if (body.fixedCoreKC && !selectedKC) {
      return NextResponse.json(
        { error: "fixedCoreKC is not valid for the selected standard" },
        { status: 400 },
      );
    }
    const bodyWithContext: GenerationSettings = {
      ...body,
      fixedCoreKC: selectedKC?.code,
      fixedCoreKCStatement: selectedKC?.statement,
    };

    const basePrompt = buildGenerationPrompt(bodyWithContext);
    const selectedModelId = body.generationModelId ?? DEFAULT_GENERATION_MODEL_ID;
    const selectedTemperature =
      body.generationTemperature ?? DEFAULT_GENERATION_TEMPERATURE;
    const allowedStandardIds = new Set<string>(body.standards);
    let validQuestions: Question[] = [];
    let generationModelId: string | null = null;
    let generationModelLabel: string | null = null;
    let lastError: unknown = null;
    let retryReason = "";
    let finalFailureReason = "";

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      validQuestions = [];
      const retrySuffix =
        attempt === 0
          ? ""
          : `\n\nIMPORTANT RETRY INSTRUCTION: Your previous output was invalid.\nReason: ${retryReason}\nReturn ONLY valid JSON (no markdown, no comments), with EXACTLY ${body.questionCount} question(s), exact standard alignment, a valid KC from the provided catalog, and the requested stimulus type/counts. Keep the MCQ Quality Checklist constraints (single best answer, plausible distractors, no giveaway cues).`;
      const finalPrompt = `${basePrompt}${retrySuffix}`;

      try {
        if (SHOULD_LOG_PROMPT) {
          console.info(
            `[generate-questions] Prompt attempt ${attempt + 1}/${MAX_GENERATION_ATTEMPTS} (length: ${finalPrompt.length})\n---BEGIN PROMPT---\n${finalPrompt}\n---END PROMPT---`
          );
        }

        const generated = await generateWithSelectedModel(
          finalPrompt,
          selectedModelId,
          selectedTemperature,
        );
        const responseText = generated.text;
        generationModelId = generated.modelId;
        generationModelLabel = generated.modelLabel;
        const rawQuestions = parseGeneratedQuestions(responseText);

        const attemptQuestions: Question[] = [];
        for (let i = 0; i < rawQuestions.length; i++) {
          const rawQuestion = rawQuestions[i];
          let generatedImageUrl: string | undefined;
          if (body.stimulusType === "illustration") {
            if (!rawQuestion || typeof rawQuestion !== "object") {
              retryReason = "Illustration question response is not an object.";
              continue;
            }
            const rawRecord = rawQuestion as Record<string, unknown>;
            const illustrationPrompt =
              typeof rawRecord.illustrationPrompt === "string"
                ? rawRecord.illustrationPrompt.trim()
                : "";
            if (!illustrationPrompt) {
              retryReason = "Missing illustrationPrompt for illustration stimulus.";
              continue;
            }
            const image = await generateIllustrationImage({
              prompt: illustrationPrompt,
            });
            generatedImageUrl = `data:image/png;base64,${image.imageB64}`;
          }
          const validated = validateQuestion(
            rawQuestion,
            i,
            allowedStandardIds,
            selectedKC,
            generatedImageUrl,
          );
          if (validated) {
            attemptQuestions.push(validated);
          }
        }

        if (attemptQuestions.length === 0) {
          retryReason = "No valid questions after validation.";
          continue;
        }

        const standardDistributionCheck = hasExactStandardDistribution(
          attemptQuestions,
          body
        );
        if (!standardDistributionCheck.ok) {
          const normalizedByStandard = tryNormalizeStandardDistribution(
            attemptQuestions,
            body
          );
          if (normalizedByStandard.ok) {
            validQuestions = normalizedByStandard.questions;
          } else {
            retryReason =
              standardDistributionCheck.error ||
              normalizedByStandard.reason ||
              "Standard distribution mismatch.";
            finalFailureReason = retryReason;
            continue;
          }
        } else {
          validQuestions = attemptQuestions;
        }

        const distributionCheck = body.stimulusType
          ? hasExpectedStimulus(validQuestions, body.stimulusType)
          : hasExactDiagramDistribution(validQuestions, body);
        if (!distributionCheck.ok) {
          if (body.stimulusType) {
            retryReason =
              distributionCheck.error || "Stimulus type mismatch.";
            finalFailureReason = retryReason;
            continue;
          }
          const normalized = tryNormalizeDiagramDistribution(validQuestions, body);
          if (normalized.ok) {
            validQuestions = normalized.questions;
            lastError = null;
            break;
          }

          retryReason =
            distributionCheck.error ||
            normalized.reason ||
            "Diagram distribution mismatch.";
          finalFailureReason = retryReason;
          continue;
        }

        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        retryReason =
          error instanceof Error
            ? error.message
            : "Failed to parse generated questions.";
        finalFailureReason = retryReason;
      }
    }

    if (lastError && validQuestions.length === 0) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to generate valid questions");
    }

    if (validQuestions.length === 0) {
      return NextResponse.json(
        {
          error:
            "Failed to generate valid questions with the exact requested diagram distribution. Please try again.",
          details: finalFailureReason || "No additional failure details available.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      questions: validQuestions,
      generatedCount: validQuestions.length,
      requestedCount: body.questionCount,
      generationModelId,
      generationModelLabel,
    });
  } catch (error) {
    console.error("Generation error:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    
    return NextResponse.json(
      { error: `Failed to generate questions: ${message}` },
      { status: 500 }
    );
  }
}
