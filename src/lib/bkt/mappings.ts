import type { Question } from "@/types/question";
import type { PartLabel } from "@/types/short-answer";

export interface EmbeddedKcMapping {
  format: "mcq" | "saq";
  partLabel: PartLabel | null;
  standardId: string;
  kcCode: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function stableQuestionContent(question: Question): string {
  return JSON.stringify(
    stableValue({
      standardId: question.standardId,
      text: question.text,
      options: question.options,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
      questionType: question.questionType,
      kcCode: question.kcCode,
      shortAnswer: question.shortAnswer,
    }),
  );
}

export async function hashQuestionContent(question: Question): Promise<string> {
  const bytes = new TextEncoder().encode(stableQuestionContent(question));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function extractEmbeddedKcMappings(question: Question): EmbeddedKcMapping[] {
  const standardId = question.standardId?.trim();
  if (!standardId) return [];
  if (question.questionType !== "open-ended") {
    return question.kcCode?.trim()
      ? [{ format: "mcq", partLabel: null, standardId, kcCode: question.kcCode.trim() }]
      : [];
  }

  const sequence = question.shortAnswer?.blueprint.taskSequence;
  if (!sequence) return [];
  return (["A", "B", "C"] as const).flatMap((partLabel) => {
    const kcCode = sequence[partLabel]?.kcCode?.trim();
    return kcCode ? [{ format: "saq" as const, partLabel, standardId, kcCode }] : [];
  });
}

export function validateEmbeddedKcMappings(
  question: Question,
  activeKcs: ReadonlySet<string>,
): string[] {
  const standardId = question.standardId?.trim();
  if (!standardId) return ["Question standardId is required for KC mapping."];
  const mappings = extractEmbeddedKcMappings(question);
  if (question.questionType !== "open-ended" && mappings.length !== 1) {
    return ["An MCQ must have exactly one KC mapping."];
  }
  if (question.questionType === "open-ended") {
    const labels = question.shortAnswer?.parts.map((part) => part.label) ?? [];
    if (mappings.length !== labels.length || labels.some((label) => !mappings.some((m) => m.partLabel === label))) {
      return ["Every scored short-answer part must have exactly one KC mapping."];
    }
  }
  return mappings.flatMap((mapping) => {
    if (!activeKcs.has(mapping.kcCode)) return [`Unknown or inactive KC: ${mapping.kcCode}`];
    if (!mapping.kcCode.startsWith(standardId)) {
      return [`KC ${mapping.kcCode} does not belong to standard ${standardId}.`];
    }
    return [];
  });
}
