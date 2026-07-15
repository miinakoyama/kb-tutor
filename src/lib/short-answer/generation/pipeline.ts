/**
 * Method2 generation pipeline — C3 ablation config (reference mvp4):
 * Blueprint ON + study-guide RAG ON + TELeR L2 item stage.
 * One item per invocation, two LLM calls inside: blueprint → item, each
 * validated with retry-on-invalid (budget 3).
 *
 * Server-side only (reads bundled data via fs). Output is the camelCase
 * `ShortAnswerItem` stored in `generated_questions.payload.shortAnswer`.
 */

import { chatComplete } from "@/lib/llm/client";
import { generateIllustrationImage } from "@/lib/llm/images";
import { findGenerationModelById } from "@/lib/llm/models";
import {
  containsPlaceholder,
  validateDiagramSvg,
  validateShortAnswerItem,
  STIMULUS_TYPES,
} from "@/lib/short-answer/item-schema";
import type {
  AnnotatedResponse,
  GenerationMetadata,
  GroundingSummary,
  ItemBlueprint,
  KeyTerm,
  PartLabel,
  ShortAnswerItem,
  ShortAnswerPart,
  StimulusAsset,
  StimulusType,
} from "@/types/short-answer";
import {
  getKCsByStandard,
  getTaxonomy,
  retrieveStudyGuideForCoreKC,
  selectRelatedCards,
  selectRelevantRubrics,
} from "./data";
import {
  buildBlueprintPrompt,
  buildItemPrompt,
  GENERATION_TELER_LEVEL,
  type GenerationContext,
} from "./prompts";

/** mvp4 ablation C3: Method2 blueprint + study-guide RAG + TELeR L2. */
export const GENERATION_METHOD = "method2_blueprint_rag_l2" as const;

const MAX_RETRIES = 3;
const BLUEPRINT_PART_KEYS = ["Part A", "Part B", "Part C"] as const;
/** Default answer-box length per part points (spec has no LLM-provided limit). */
const MAX_LENGTH_BY_POINTS: Record<number, number> = { 1: 400, 2: 700, 3: 900 };

export interface GenerationInput {
  standardCode: string;
  fixedCoreKC?: string;
  stimulusType?: StimulusType;
  modelId: string;
  temperature: number;
}

export interface GenerationOutput {
  blueprint: ItemBlueprint;
  item: ShortAnswerItem;
  grounding: GroundingSummary;
  metadata: GenerationMetadata;
}

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly stage: "blueprint" | "item" | "illustration",
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

function randomPick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeKCCode(value: unknown, codes: string[]): string | null {
  if (typeof value !== "string") return null;
  if (codes.includes(value)) return value;
  return codes.find((code) => code.endsWith(value)) ?? null;
}

// ── snake_case validators (ported from reference lib/aig/pipeline.ts) ──────────

interface RawBlueprint {
  target_standard: string;
  anchor_kc: string;
  core_kc: string;
  selected_kcs: string[];
  supporting_kcs?: string[];
  stem_affordance: string;
  compatibility_rationale: string;
  cognitive_demand: string;
  key_concepts: string[];
  task_sequence: Record<
    string,
    { kc_code: string; task_type: string; function: string } | undefined
  >;
  stimulus_type: StimulusType;
  evidence_pattern: string;
  expected_response_elements: string[];
  common_incomplete_responses: string[];
}

function validateRawBlueprint(
  parsed: unknown,
  taxonomyTypes: string[],
  standardKCCodes: string[],
  fixedCoreKC: string,
  fixedStimulusType: StimulusType,
): string | null {
  if (!parsed || typeof parsed !== "object") return "Response is not an object";
  const bp = parsed as Record<string, unknown>;
  for (const key of [
    "target_standard",
    "anchor_kc",
    "core_kc",
    "selected_kcs",
    "cognitive_demand",
    "key_concepts",
    "task_sequence",
    "stimulus_type",
    "evidence_pattern",
    "expected_response_elements",
    "common_incomplete_responses",
  ]) {
    if (!(key in bp)) return `Missing key: ${key}`;
  }

  const anchorKC = normalizeKCCode(bp.anchor_kc, standardKCCodes);
  if (!anchorKC) return `anchor_kc must be a valid KC code: "${String(bp.anchor_kc)}"`;
  if (anchorKC !== fixedCoreKC) {
    return `anchor_kc must equal the preselected anchor KC: "${fixedCoreKC}"`;
  }
  bp.anchor_kc = anchorKC;

  const coreKC = normalizeKCCode(bp.core_kc, standardKCCodes);
  if (!coreKC || coreKC !== anchorKC) return "core_kc must equal anchor_kc";
  bp.core_kc = coreKC;

  if (bp.stimulus_type !== fixedStimulusType) {
    return `stimulus_type must equal the requested stimulus type: "${fixedStimulusType}"`;
  }

  const seq = bp.task_sequence as Record<
    string,
    { kc_code?: string; task_type?: string } | undefined
  >;
  if (!seq["Part A"] || !seq["Part B"]) {
    return "task_sequence must include Part A and Part B";
  }
  const presentParts = BLUEPRINT_PART_KEYS.filter((p) => seq[p]);
  for (const part of presentParts) {
    const p = seq[part]!;
    if (!p.task_type || !taxonomyTypes.includes(p.task_type)) {
      return `Invalid or missing task_type for ${part}: "${p.task_type}"`;
    }
    const normalizedKC = normalizeKCCode(p.kc_code, standardKCCodes);
    if (!normalizedKC) {
      return `Invalid or missing kc_code for ${part}: "${String(p.kc_code)}"`;
    }
    p.kc_code = normalizedKC;
  }

  const partKCs = presentParts.map((part) => seq[part]!.kc_code!);
  if (!partKCs.includes(anchorKC)) {
    return `anchor_kc must be assigned to at least one part: "${anchorKC}"`;
  }

  const selected = bp.selected_kcs;
  if (!Array.isArray(selected)) return "selected_kcs must be an array";
  const normalizedSelected = Array.from(
    new Set(
      (selected as unknown[])
        .map((code) => normalizeKCCode(code, standardKCCodes))
        .filter((code): code is string => Boolean(code)),
    ),
  );
  if (normalizedSelected.length !== (selected as unknown[]).length) {
    return "selected_kcs must contain only valid KC codes";
  }
  for (const code of Array.from(new Set(partKCs))) {
    if (!normalizedSelected.includes(code)) {
      return `selected_kcs must include every part kc_code: "${code}"`;
    }
  }
  if (!normalizedSelected.includes(anchorKC)) {
    return `selected_kcs must include anchor_kc: "${anchorKC}"`;
  }
  bp.selected_kcs = normalizedSelected;

  return null;
}

interface RawItem {
  stem: string;
  stimulus_asset: Record<string, unknown> & { type: string; title: string };
  parts: Record<string, { task_type?: string; question: string } | undefined>;
  part_rubrics: Record<string, { points_possible: number; criteria: Record<string, string> } | undefined>;
  annotated_responses: Array<{ score: number; response: string; annotation: string }>;
  key_terms: Array<{ term: string; definition: string }>;
}

function validateRawStimulus(
  asset: Record<string, unknown>,
  blueprintStimulus: StimulusType,
): string | null {
  if (asset.type !== blueprintStimulus) {
    return `stimulus_asset.type must equal blueprint stimulus_type: "${blueprintStimulus}"`;
  }
  if (typeof asset.title !== "string" || !asset.title.trim()) {
    return "stimulus_asset.title must be a non-empty string";
  }
  if (blueprintStimulus === "table") {
    if (typeof asset.table_markdown !== "string" || !asset.table_markdown.includes("|")) {
      return "stimulus_asset.table_markdown must be a GFM table string";
    }
  } else if (blueprintStimulus === "line_graph" || blueprintStimulus === "bar_chart") {
    const chart = asset.chart_data as
      | { x_label?: unknown; y_label?: unknown; series?: unknown }
      | undefined;
    if (!chart || typeof chart !== "object") return "stimulus_asset.chart_data is required";
    if (typeof chart.x_label !== "string" || !chart.x_label.trim()) {
      return "chart_data.x_label must be a non-empty string";
    }
    if (typeof chart.y_label !== "string" || !chart.y_label.trim()) {
      return "chart_data.y_label must be a non-empty string";
    }
    if (!Array.isArray(chart.series) || chart.series.length === 0) {
      return "chart_data.series must be a non-empty array";
    }
    for (const series of chart.series as Array<Record<string, unknown>>) {
      if (!series || typeof series !== "object" || typeof series.name !== "string") {
        return "each chart series must have a name";
      }
      const points = series.points;
      if (!Array.isArray(points) || points.length === 0) {
        return "each chart series must have at least one [x, y] point";
      }
      for (const point of points) {
        if (!Array.isArray(point) || point.length !== 2) {
          return "chart points must be [x, y] pairs";
        }
        const y = typeof point[1] === "string" ? Number(point[1]) : point[1];
        if (typeof y !== "number" || !Number.isFinite(y)) {
          return "chart point y values must be numeric";
        }
      }
    }
  } else if (blueprintStimulus === "diagram") {
    if (typeof asset.diagram_spec !== "string" || !asset.diagram_spec.includes("<svg")) {
      return "stimulus_asset.diagram_spec must be a complete SVG string";
    }
    const svgError = validateDiagramSvg(asset.diagram_spec);
    if (svgError) return svgError;
  } else if (blueprintStimulus === "scenario") {
    if (typeof asset.scenario_text !== "string" || !asset.scenario_text.trim()) {
      return "stimulus_asset.scenario_text must be a non-empty string";
    }
  } else if (blueprintStimulus === "illustration") {
    if (typeof asset.illustration_prompt !== "string" || !asset.illustration_prompt.trim()) {
      return "stimulus_asset.illustration_prompt must be a non-empty string";
    }
  }
  return null;
}

function validateRawItem(parsed: unknown, blueprintStimulus: StimulusType): string | null {
  if (!parsed || typeof parsed !== "object") return "Response is not an object";
  const item = parsed as Record<string, unknown>;
  for (const key of [
    "stem",
    "stimulus_asset",
    "parts",
    "part_rubrics",
    "annotated_responses",
    "key_terms",
  ]) {
    if (!(key in item)) return `Missing key: ${key}`;
  }

  if (typeof item.stem !== "string" || !item.stem.trim()) {
    return "stem must be a non-empty string";
  }
  if (containsPlaceholder(item.stem)) {
    return "stem contains unresolved placeholder text (e.g. [term] or <term>)";
  }

  const asset = item.stimulus_asset as Record<string, unknown>;
  if (!asset || typeof asset !== "object") return "stimulus_asset must be an object";
  const stimulusError = validateRawStimulus(asset, blueprintStimulus);
  if (stimulusError) return stimulusError;

  const parts = item.parts as Record<string, unknown>;
  if (!parts["Part A"] || !parts["Part B"]) return "parts must include Part A and Part B";
  for (const key of BLUEPRINT_PART_KEYS) {
    const part = parts[key] as { question?: unknown } | undefined;
    if (!part) continue;
    if (typeof part.question !== "string" || !part.question.trim()) {
      return `parts.${key}.question must be a non-empty string`;
    }
    if (containsPlaceholder(part.question)) {
      return `parts.${key}.question contains unresolved placeholder text`;
    }
  }

  const partRubrics = item.part_rubrics as Record<string, unknown> | undefined;
  if (!partRubrics || typeof partRubrics !== "object") return "part_rubrics must be an object";
  const generatedParts = BLUEPRINT_PART_KEYS.filter((p) => parts[p]);
  let totalPoints = 0;
  for (const part of generatedParts) {
    const r = partRubrics[part] as
      | { points_possible?: unknown; criteria?: Record<string, unknown> }
      | undefined;
    if (!r || typeof r !== "object") return `part_rubrics.${part} must be an object`;
    const points = r.points_possible;
    if (typeof points !== "number" || !Number.isInteger(points) || points < 1 || points > 3) {
      return `part_rubrics.${part}.points_possible must be 1, 2, or 3`;
    }
    totalPoints += points;
    if (!r.criteria || typeof r.criteria !== "object") {
      return `part_rubrics.${part}.criteria must be an object`;
    }
    for (const value of Object.values(r.criteria)) {
      if (typeof value !== "string" || !value.trim() || containsPlaceholder(value)) {
        return `part_rubrics.${part}.criteria values must be concrete non-empty strings`;
      }
    }
  }
  if (totalPoints !== 3) return "part_rubrics points must sum to 3";

  const responses = item.annotated_responses;
  if (!Array.isArray(responses)) return "annotated_responses must be an array";
  const required = new Set([0, 1, 2, 3]);
  for (const r of responses) {
    if (!r || typeof r !== "object") return "annotated_responses entries must be objects";
    const rec = r as Record<string, unknown>;
    if (typeof rec.score !== "number" || ![0, 1, 2, 3].includes(rec.score)) {
      return "annotated_responses.score must be 0, 1, 2, or 3";
    }
    required.delete(rec.score);
    if (typeof rec.response !== "string" || !rec.response.trim()) {
      return "annotated_responses.response must be non-empty";
    }
    if (typeof rec.annotation !== "string" || !rec.annotation.trim()) {
      return "annotated_responses.annotation must be non-empty";
    }
  }
  if (required.size > 0) {
    return `annotated_responses must include scores: ${Array.from(required).join(", ")}`;
  }

  const keyTerms = item.key_terms;
  if (!Array.isArray(keyTerms) || keyTerms.length === 0) {
    return "key_terms must be a non-empty array";
  }
  const seenDefinitions = new Set<string>();
  for (const kt of keyTerms) {
    if (!kt || typeof kt !== "object") return "key_terms entries must be objects";
    const rec = kt as Record<string, unknown>;
    if (typeof rec.term !== "string" || !rec.term.trim()) {
      return "key_terms.term must be a non-empty string";
    }
    if (typeof rec.definition !== "string" || !rec.definition.trim()) {
      return "key_terms.definition must be a non-empty string";
    }
    if (containsPlaceholder(rec.term) || containsPlaceholder(rec.definition)) {
      return "key_terms contains unresolved placeholder text";
    }
    const definitionKey = rec.definition.trim().toLowerCase();
    if (seenDefinitions.has(definitionKey)) {
      return `key_terms must have a unique definition per term — "${rec.term}" reuses another term's definition`;
    }
    seenDefinitions.add(definitionKey);
  }

  return null;
}

// ── LLM call with schema-aware retries ─────────────────────────────────────────

async function callWithRetry<T>(
  system: string,
  user: string,
  validate: (parsed: unknown) => string | null,
  model: string,
  temperature: number,
  stage: "blueprint" | "item",
): Promise<T> {
  let lastError = "Unknown validation error";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const userMsg =
      attempt === 1
        ? user
        : [
            user,
            "",
            `PREVIOUS ATTEMPT FAILED: ${lastError}`,
            "Return corrected JSON only.",
            "Do not omit any required keys from the schema.",
          ].join("\n");

    let content: string;
    try {
      const res = await chatComplete({
        model,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        jsonMode: true,
      });
      content = res.content;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      lastError = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    const error = validate(parsed);
    if (!error) return parsed as T;
    lastError = error;
  }
  throw new GenerationError(
    `Generation failed after ${MAX_RETRIES} attempts: ${lastError}`,
    stage,
    true,
  );
}

// ── snake_case → camelCase mappers ─────────────────────────────────────────────

function mapStimulus(asset: RawItem["stimulus_asset"]): StimulusAsset {
  const title = String(asset.title);
  const type = asset.type as StimulusType;
  switch (type) {
    case "table":
      return { type, title, tableMarkdown: String(asset.table_markdown ?? "") };
    case "line_graph":
    case "bar_chart": {
      const chart = (asset.chart_data ?? {}) as {
        x_label?: string;
        y_label?: string;
        series?: { name: string; points: [number | string, number][] }[];
      };
      return {
        type,
        title,
        chartData: {
          xLabel: String(chart.x_label ?? ""),
          yLabel: String(chart.y_label ?? ""),
          series: (chart.series ?? []).map((s) => ({
            name: s.name,
            points: s.points.map(
              ([x, y]) => [x, typeof y === "string" ? Number(y) : y] as [number | string, number],
            ),
          })),
        },
      };
    }
    case "diagram":
      return { type, title, diagramSvg: String(asset.diagram_spec ?? "") };
    case "scenario":
      return { type, title, scenarioText: String(asset.scenario_text ?? "") };
    case "illustration": {
      const stimulus: StimulusAsset = {
        type,
        title,
        illustrationPrompt: String(asset.illustration_prompt ?? ""),
      };
      if (typeof asset.image_b64 === "string" && asset.image_b64.trim()) {
        return { ...stimulus, imageB64: asset.image_b64.trim() };
      }
      return stimulus;
    }
  }
}

function mapBlueprint(bp: RawBlueprint): ItemBlueprint {
  const taskSequence: ItemBlueprint["taskSequence"] = {};
  for (const key of BLUEPRINT_PART_KEYS) {
    const entry = bp.task_sequence[key];
    if (!entry) continue;
    const label = key.replace("Part ", "") as PartLabel;
    taskSequence[label] = {
      kcCode: entry.kc_code,
      taskType: entry.task_type,
      function: entry.function,
    };
  }
  return {
    targetStandard: bp.target_standard,
    anchorKc: bp.anchor_kc,
    coreKc: bp.core_kc,
    selectedKcs: bp.selected_kcs,
    supportingKcs: bp.supporting_kcs ?? [],
    stemAffordance: bp.stem_affordance,
    compatibilityRationale: bp.compatibility_rationale,
    cognitiveDemand: bp.cognitive_demand,
    keyConcepts: bp.key_concepts,
    taskSequence,
    stimulusType: bp.stimulus_type,
    evidencePattern: bp.evidence_pattern,
    expectedResponseElements: bp.expected_response_elements,
    commonIncompleteResponses: bp.common_incomplete_responses,
  };
}

function partScoringGuidance(criteria: Record<string, string>): string {
  return Object.entries(criteria)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([score, text]) => `${score} point${Number(score) === 1 ? "" : "s"}: ${text}`)
    .join("\n");
}

const MAX_KEY_TERMS = 8;

/** De-dupes by term text (case-insensitive) and caps at MAX_KEY_TERMS. */
function mapKeyTerms(raw: RawItem["key_terms"]): KeyTerm[] {
  const terms: KeyTerm[] = [];
  const seen = new Set<string>();
  for (const kt of raw) {
    const key = kt.term.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push({ term: kt.term.trim(), definition: kt.definition.trim() });
    if (terms.length >= MAX_KEY_TERMS) break;
  }
  return terms;
}

function mapItem(
  raw: RawItem,
  bp: RawBlueprint,
  camelBlueprint: ItemBlueprint,
  generation: GenerationMetadata,
): ShortAnswerItem {
  const parts: ShortAnswerPart[] = [];
  const generatedKeys = BLUEPRINT_PART_KEYS.filter((k) => raw.parts[k]);
  for (const key of generatedKeys) {
    const label = key.replace("Part ", "") as PartLabel;
    const rawPart = raw.parts[key]!;
    const rubric = raw.part_rubrics[key]!;
    const taskType =
      bp.task_sequence[key]?.task_type ?? rawPart.task_type ?? "Explain Mechanism";
    const maxScore = rubric.points_possible;
    parts.push({
      label,
      prompt: rawPart.question,
      taskType,
      maxScore,
      rubric: {
        pointsPossible: maxScore,
        criteria: rubric.criteria,
      },
      scoringGuidance: partScoringGuidance(rubric.criteria),
      maxLength: MAX_LENGTH_BY_POINTS[maxScore] ?? 600,
    });
  }

  const annotated: AnnotatedResponse[] = raw.annotated_responses.map((r) => ({
    score: r.score,
    response: r.response,
    annotation: r.annotation,
  }));

  return {
    stem: raw.stem,
    stimulus: mapStimulus(raw.stimulus_asset),
    parts,
    keyTerms: mapKeyTerms(raw.key_terms),
    annotatedResponses: annotated,
    blueprint: camelBlueprint,
    generation,
  };
}

// ── Pipeline ───────────────────────────────────────────────────────────────────

export async function generateShortAnswerItem(
  input: GenerationInput,
): Promise<GenerationOutput> {
  if (!findGenerationModelById(input.modelId)) {
    throw new GenerationError(`Unknown generation model: ${input.modelId}`, "blueprint", false);
  }

  const standardKCs = getKCsByStandard(input.standardCode);
  if (standardKCs.length === 0) {
    throw new GenerationError(
      `No KCs found for standard: ${input.standardCode}`,
      "blueprint",
      false,
    );
  }

  const coreKC = input.fixedCoreKC
    ? standardKCs.find((kc) => kc.code === input.fixedCoreKC)
    : randomPick(standardKCs);
  if (!coreKC) {
    throw new GenerationError(
      `Core KC "${input.fixedCoreKC}" is not valid for standard "${input.standardCode}"`,
      "blueprint",
      false,
    );
  }

  const stimulusType: StimulusType =
    input.stimulusType ?? randomPick(STIMULUS_TYPES);

  const taxonomy = getTaxonomy();
  const coreVocab = Array.from(new Set(coreKC.vocab));
  const relatedCards = selectRelatedCards(coreVocab);
  const relevantRubrics = selectRelevantRubrics(input.standardCode, coreVocab);
  const studyGuideChunks = await retrieveStudyGuideForCoreKC(coreKC);

  const grounding: GroundingSummary = {
    studyGuide: {
      empty: studyGuideChunks.length === 0,
      chunkIds: studyGuideChunks.map((c) => c.chunkId),
    },
    rubric: { empty: relevantRubrics.length === 0, items: relevantRubrics.map((r) => r.item) },
    cards: { empty: relatedCards.length === 0, cardIds: relatedCards.map((c) => c.card_id) },
  };

  const ctx: GenerationContext = {
    standard: input.standardCode,
    standardKCs,
    selectedCoreKC: coreKC,
    taxonomyRows: taxonomy,
    relevantRubrics,
    studyGuideChunks,
  };

  const taxonomyTypes = Object.keys(taxonomy);
  const standardKCCodes = standardKCs.map((kc) => kc.code);

  // Stage 1: blueprint.
  const bpPrompt = buildBlueprintPrompt(ctx, { stimulusType });
  const rawBlueprint = await callWithRetry<RawBlueprint>(
    bpPrompt.system,
    bpPrompt.user,
    (p) => validateRawBlueprint(p, taxonomyTypes, standardKCCodes, coreKC.code, stimulusType),
    input.modelId,
    input.temperature,
    "blueprint",
  );

  // Stage 2: item (TELeR L2 — study-guide details withheld at item stage).
  const itemPrompt = buildItemPrompt(rawBlueprint, ctx, GENERATION_TELER_LEVEL);
  const rawItem = await callWithRetry<RawItem>(
    itemPrompt.system,
    itemPrompt.user,
    (p) => validateRawItem(p, stimulusType),
    input.modelId,
    input.temperature,
    "item",
  );

  const metadata: GenerationMetadata = {
    method: GENERATION_METHOD,
    useBlueprint: true,
    useStudyGuideRag: true,
    telerLevel: GENERATION_TELER_LEVEL,
    modelId: input.modelId,
    temperature: input.temperature,
    grounding,
    generatedAt: new Date().toISOString(),
  };

  const camelBlueprint = mapBlueprint(rawBlueprint);
  let item = mapItem(rawItem, rawBlueprint, camelBlueprint, metadata);

  // Defense-in-depth: the stored item must pass the same structural validator
  // used on load (item-schema), which also enforces standard/task-type checks.
  const structuralError = validateShortAnswerItem(item, {
    standardId: input.standardCode,
    validTaskTypes: taxonomyTypes,
    validKcCodes: standardKCCodes,
  });
  if (structuralError) {
    throw new GenerationError(
      `Generated item failed structural validation: ${structuralError}`,
      "item",
      true,
    );
  }

  if (item.stimulus.type === "illustration") {
    let imageB64: string | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await generateIllustrationImage({
          prompt: item.stimulus.illustrationPrompt,
        });
        imageB64 = result.imageB64;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!imageB64) {
      const detail =
        lastError instanceof Error ? lastError.message : String(lastError ?? "unknown");
      throw new GenerationError(
        `Illustration image generation failed after ${MAX_RETRIES} attempts: ${detail}`,
        "illustration",
        true,
      );
    }
    item = {
      ...item,
      stimulus: { ...item.stimulus, imageB64 },
    };
  }

  return { blueprint: camelBlueprint, item, grounding, metadata };
}
