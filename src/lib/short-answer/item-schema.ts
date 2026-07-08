/**
 * Structural validators for stored short-answer items and blueprints
 * (the camelCase content model in src/types/short-answer.ts).
 *
 * Used by the generation route before an item is accepted (FR-034) and as a
 * load-time guard when question payloads are read (research R8). Runs in both
 * server and client contexts — no fs access here.
 */

import type {
  ItemBlueprint,
  ShortAnswerItem,
  StimulusAsset,
  StimulusType,
} from "@/types/short-answer";
import { STANDARD_DEFINITIONS } from "@/lib/standards";

export const STIMULUS_TYPES: StimulusType[] = [
  "table",
  "line_graph",
  "bar_chart",
  "diagram",
  "scenario",
  "illustration",
];

const STANDARD_IDS = new Set(STANDARD_DEFINITIONS.map((s) => s.id));
const PART_LABELS = ["A", "B", "C"] as const;
const MAX_DIAGRAM_SVG_BYTES = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Unresolved template placeholders like "[insert term]" or "<organism name>".
 * Mirrors the reference project's rubric placeholder check.
 */
export function containsPlaceholder(text: unknown): boolean {
  if (typeof text !== "string") return false;
  return /\[[^\]]+\]/.test(text) || /<[^>]+>/.test(text);
}

/**
 * Diagram SVG safety: reject executable or externally-referencing content.
 * Rendering additionally goes through an <img> data URI (research R10), so
 * this is defense-in-depth, not the only barrier.
 */
export function validateDiagramSvg(svg: string): string | null {
  if (!isNonEmptyString(svg)) return "diagram SVG must be a non-empty string";
  if (svg.length > MAX_DIAGRAM_SVG_BYTES) {
    return "diagram SVG exceeds the size limit";
  }
  const lower = svg.toLowerCase();
  if (!lower.includes("<svg")) return "diagram SVG must contain an <svg> root";
  if (lower.includes("<script")) return "diagram SVG must not contain scripts";
  if (/\son[a-z]+\s*=/.test(lower)) {
    return "diagram SVG must not contain event handlers";
  }
  if (lower.includes("javascript:")) {
    return "diagram SVG must not contain javascript: URIs";
  }
  if (lower.includes("<foreignobject")) {
    return "diagram SVG must not contain foreignObject";
  }
  if (/(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//.test(lower)) {
    return "diagram SVG must not reference external resources";
  }
  return null;
}

export function validateStimulusAsset(value: unknown): string | null {
  if (!isRecord(value)) return "stimulus must be an object";
  const type = value.type;
  if (typeof type !== "string" || !STIMULUS_TYPES.includes(type as StimulusType)) {
    return `stimulus.type must be one of: ${STIMULUS_TYPES.join(", ")}`;
  }
  if (!isNonEmptyString(value.title)) {
    return "stimulus.title must be a non-empty string";
  }

  switch (type as StimulusType) {
    case "table":
      if (!isNonEmptyString(value.tableMarkdown)) {
        return "stimulus.tableMarkdown required when type=table";
      }
      break;
    case "line_graph":
    case "bar_chart": {
      const chart = value.chartData;
      if (!isRecord(chart)) {
        return "stimulus.chartData required when type=line_graph or bar_chart";
      }
      if (!isNonEmptyString(chart.xLabel) || !isNonEmptyString(chart.yLabel)) {
        return "stimulus.chartData must include xLabel and yLabel";
      }
      const series = chart.series;
      if (!Array.isArray(series) || series.length === 0) {
        return "stimulus.chartData.series must be a non-empty array";
      }
      for (const entry of series) {
        if (!isRecord(entry) || !isNonEmptyString(entry.name)) {
          return "each chart series must have a name";
        }
        const points = entry.points;
        if (!Array.isArray(points) || points.length === 0) {
          return "each chart series must have data points";
        }
        for (const point of points) {
          if (
            !Array.isArray(point) ||
            point.length !== 2 ||
            typeof point[1] !== "number" ||
            !Number.isFinite(point[1])
          ) {
            return "chart points must be [x, y] pairs with numeric y";
          }
        }
      }
      break;
    }
    case "diagram": {
      if (typeof value.diagramSvg !== "string") {
        return "stimulus.diagramSvg required when type=diagram";
      }
      const svgError = validateDiagramSvg(value.diagramSvg);
      if (svgError) return svgError;
      break;
    }
    case "scenario":
      if (!isNonEmptyString(value.scenarioText)) {
        return "stimulus.scenarioText required when type=scenario";
      }
      break;
    case "illustration":
      if (!isNonEmptyString(value.illustrationPrompt)) {
        return "stimulus.illustrationPrompt required when type=illustration";
      }
      if (
        value.imageB64 !== undefined &&
        (typeof value.imageB64 !== "string" || !value.imageB64.trim())
      ) {
        return "stimulus.imageB64 must be a non-empty string when provided";
      }
      break;
  }

  return null;
}

export interface ValidateItemOptions {
  /**
   * Taxonomy task-type names to validate part taskTypes against. Available on
   * the server at generation time; omitted for client-side load guards.
   */
  validTaskTypes?: string[];
  /** KC codes valid for the item's standard (server-side generation checks). */
  validKcCodes?: string[];
  /** Standard the item must target (e.g. the requested generation standard). */
  standardId?: string;
}

export function validateBlueprint(
  value: unknown,
  options: ValidateItemOptions = {},
): string | null {
  if (!isRecord(value)) return "blueprint must be an object";
  const bp = value as Partial<ItemBlueprint> & Record<string, unknown>;

  if (!isNonEmptyString(bp.targetStandard)) {
    return "blueprint.targetStandard must be a non-empty string";
  }
  if (!STANDARD_IDS.has(bp.targetStandard)) {
    return `blueprint.targetStandard is not a known standard: "${bp.targetStandard}"`;
  }
  if (options.standardId && bp.targetStandard !== options.standardId) {
    return `blueprint.targetStandard must equal "${options.standardId}"`;
  }
  if (!isNonEmptyString(bp.anchorKc)) return "blueprint.anchorKc is required";
  if (!isNonEmptyString(bp.coreKc)) return "blueprint.coreKc is required";
  if (bp.anchorKc !== bp.coreKc) {
    return "blueprint.coreKc must equal blueprint.anchorKc";
  }
  if (options.validKcCodes && !options.validKcCodes.includes(bp.anchorKc)) {
    return `blueprint.anchorKc is not a KC under the standard: "${bp.anchorKc}"`;
  }

  if (!Array.isArray(bp.selectedKcs) || bp.selectedKcs.length === 0) {
    return "blueprint.selectedKcs must be a non-empty array";
  }
  if (!bp.selectedKcs.includes(bp.anchorKc)) {
    return "blueprint.selectedKcs must include the anchor KC";
  }
  if (options.validKcCodes) {
    for (const code of bp.selectedKcs) {
      if (!options.validKcCodes.includes(code)) {
        return `blueprint.selectedKcs contains an unknown KC code: "${String(code)}"`;
      }
    }
  }

  const taskSequence = bp.taskSequence;
  if (!isRecord(taskSequence)) return "blueprint.taskSequence must be an object";
  if (!taskSequence.A || !taskSequence.B) {
    return "blueprint.taskSequence must include parts A and B";
  }
  for (const label of PART_LABELS) {
    const entry = taskSequence[label];
    if (entry === undefined) continue;
    if (!isRecord(entry)) return `blueprint.taskSequence.${label} must be an object`;
    if (!isNonEmptyString(entry.kcCode)) {
      return `blueprint.taskSequence.${label}.kcCode is required`;
    }
    if (!bp.selectedKcs.includes(entry.kcCode)) {
      return `blueprint.selectedKcs must include every part KC ("${entry.kcCode}")`;
    }
    if (!isNonEmptyString(entry.taskType)) {
      return `blueprint.taskSequence.${label}.taskType is required`;
    }
    if (
      options.validTaskTypes &&
      !options.validTaskTypes.includes(entry.taskType)
    ) {
      return `blueprint.taskSequence.${label}.taskType is not a taxonomy task type: "${entry.taskType}"`;
    }
  }

  if (
    typeof bp.stimulusType !== "string" ||
    !STIMULUS_TYPES.includes(bp.stimulusType as StimulusType)
  ) {
    return `blueprint.stimulusType must be one of: ${STIMULUS_TYPES.join(", ")}`;
  }
  if (!Array.isArray(bp.expectedResponseElements)) {
    return "blueprint.expectedResponseElements must be an array";
  }
  if (!Array.isArray(bp.commonIncompleteResponses)) {
    return "blueprint.commonIncompleteResponses must be an array";
  }

  return null;
}

export function validateShortAnswerItem(
  value: unknown,
  options: ValidateItemOptions = {},
): string | null {
  if (!isRecord(value)) return "item must be an object";
  const item = value as Partial<ShortAnswerItem> & Record<string, unknown>;

  if (!isNonEmptyString(item.stem)) return "item.stem must be a non-empty string";
  if (containsPlaceholder(item.stem)) {
    return "item.stem contains unresolved placeholder text";
  }

  const stimulusError = validateStimulusAsset(item.stimulus);
  if (stimulusError) return stimulusError;

  const parts = item.parts;
  if (!Array.isArray(parts) || parts.length < 2 || parts.length > 3) {
    return "item.parts must contain 2 or 3 parts";
  }
  let totalPoints = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!isRecord(part)) return `item.parts[${i}] must be an object`;
    if (part.label !== PART_LABELS[i]) {
      return `item.parts[${i}].label must be "${PART_LABELS[i]}" (parts in A/B/C order)`;
    }
    if (!isNonEmptyString(part.prompt)) {
      return `Part ${PART_LABELS[i]} prompt must be a non-empty string`;
    }
    if (containsPlaceholder(part.prompt)) {
      return `Part ${PART_LABELS[i]} prompt contains unresolved placeholder text`;
    }
    if (!isNonEmptyString(part.taskType)) {
      return `Part ${PART_LABELS[i]} taskType is required`;
    }
    if (
      options.validTaskTypes &&
      !options.validTaskTypes.includes(part.taskType)
    ) {
      return `Part ${PART_LABELS[i]} taskType is not a taxonomy task type: "${part.taskType}"`;
    }
    if (
      typeof part.maxScore !== "number" ||
      !Number.isInteger(part.maxScore) ||
      part.maxScore < 1
    ) {
      return `Part ${PART_LABELS[i]} maxScore must be a positive integer`;
    }
    totalPoints += part.maxScore;
    const partRubric = part.rubric;
    if (isRecord(partRubric)) {
      if (partRubric.pointsPossible !== part.maxScore) {
        return `Part ${PART_LABELS[i]} rubric.pointsPossible must equal maxScore`;
      }
      if (!isRecord(partRubric.criteria)) {
        return `Part ${PART_LABELS[i]} rubric.criteria must be an object`;
      }
      for (let score = 0; score <= part.maxScore; score++) {
        const text = partRubric.criteria[String(score)];
        if (!isNonEmptyString(text)) {
          return `Part ${PART_LABELS[i]} rubric.criteria must include score ${score}`;
        }
        if (containsPlaceholder(text)) {
          return `Part ${PART_LABELS[i]} rubric contains unresolved placeholder text`;
        }
      }
    } else if (!isNonEmptyString(part.scoringGuidance)) {
      return `Part ${PART_LABELS[i]} rubric is required`;
    } else if (containsPlaceholder(part.scoringGuidance)) {
      return `Part ${PART_LABELS[i]} scoringGuidance contains unresolved placeholder text`;
    }
    if (
      typeof part.maxLength !== "number" ||
      !Number.isInteger(part.maxLength) ||
      part.maxLength < 1
    ) {
      return `Part ${PART_LABELS[i]} maxLength must be a positive integer`;
    }
  }

  const keyTerms = item.keyTerms;
  if (!Array.isArray(keyTerms)) return "item.keyTerms must be an array";
  for (const term of keyTerms) {
    if (
      !isRecord(term) ||
      !isNonEmptyString(term.term) ||
      !isNonEmptyString(term.definition)
    ) {
      return "each keyTerms entry must have a term and a definition";
    }
  }

  const annotated = item.annotatedResponses;
  if (!Array.isArray(annotated)) {
    return "item.annotatedResponses must be an array";
  }
  const requiredScores = new Set<number>();
  for (let score = 0; score <= totalPoints; score++) requiredScores.add(score);
  for (const response of annotated) {
    if (!isRecord(response)) return "annotatedResponses entries must be objects";
    if (
      typeof response.score !== "number" ||
      !Number.isInteger(response.score) ||
      response.score < 0 ||
      response.score > totalPoints
    ) {
      return `annotatedResponses.score must be an integer in 0..${totalPoints}`;
    }
    requiredScores.delete(response.score);
    if (!isNonEmptyString(response.response)) {
      return "annotatedResponses.response must be a non-empty string";
    }
    if (!isNonEmptyString(response.annotation)) {
      return "annotatedResponses.annotation must be a non-empty string";
    }
    if (
      containsPlaceholder(response.response) ||
      containsPlaceholder(response.annotation)
    ) {
      return "annotatedResponses contains unresolved placeholder text";
    }
  }
  if (requiredScores.size > 0) {
    return `annotatedResponses must include score levels: ${Array.from(requiredScores).join(", ")}`;
  }

  const blueprintError = validateBlueprint(item.blueprint, options);
  if (blueprintError) return blueprintError;

  const blueprint = item.blueprint as ItemBlueprint;
  const stimulus = item.stimulus as StimulusAsset;
  if (stimulus.type !== blueprint.stimulusType) {
    return `stimulus.type must equal blueprint.stimulusType ("${blueprint.stimulusType}")`;
  }

  const generation = item.generation;
  if (generation !== undefined) {
    if (!isRecord(generation)) return "item.generation must be an object";
    if (!isNonEmptyString(generation.method)) {
      return "item.generation.method is required";
    }
    if (!isNonEmptyString(generation.modelId)) {
      return "item.generation.modelId is required";
    }
  }

  return null;
}

export function isShortAnswerItem(value: unknown): value is ShortAnswerItem {
  return validateShortAnswerItem(value) === null;
}
