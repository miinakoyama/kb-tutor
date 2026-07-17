import type { Question } from "@/types/question";
import type { ShortAnswerItem } from "@/types/short-answer";
import { validateShortAnswerItem } from "@/lib/short-answer/item-schema";

export interface RuntimeShortAnswerResolution {
  item: ShortAnswerItem | null;
  error: string | null;
  repairedLegacyKeyTerms: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accept pre-2026-07-15 SAQs whose only structural problem is that the old
 * generator copied one KC statement into several glossary definitions.
 *
 * Every term in a duplicated-definition group is removed: retaining an
 * arbitrary first term would present a broad KC statement as that word's
 * definition. Key terms support feedback but do not affect scoring, so an
 * omitted glossary is safer than incorrect instructional content.
 */
export function resolveRuntimeShortAnswerItem(
  value: unknown,
): RuntimeShortAnswerResolution {
  const initialError = validateShortAnswerItem(value);
  if (!initialError) {
    return {
      item: value as ShortAnswerItem,
      error: null,
      repairedLegacyKeyTerms: false,
    };
  }
  if (!initialError.startsWith("keyTerms must have a unique definition per term")) {
    return { item: null, error: initialError, repairedLegacyKeyTerms: false };
  }
  if (!isRecord(value) || !Array.isArray(value.keyTerms)) {
    return { item: null, error: initialError, repairedLegacyKeyTerms: false };
  }

  const definitionCounts = new Map<string, number>();
  for (const entry of value.keyTerms) {
    if (!isRecord(entry) || typeof entry.definition !== "string") continue;
    const key = entry.definition.trim().toLowerCase();
    definitionCounts.set(key, (definitionCounts.get(key) ?? 0) + 1);
  }
  const repaired = {
    ...value,
    keyTerms: value.keyTerms.filter((entry) => {
      if (!isRecord(entry) || typeof entry.definition !== "string") return true;
      return definitionCounts.get(entry.definition.trim().toLowerCase()) === 1;
    }),
  };
  const repairedError = validateShortAnswerItem(repaired);
  if (repairedError) {
    return { item: null, error: repairedError, repairedLegacyKeyTerms: false };
  }
  return {
    item: repaired as ShortAnswerItem,
    error: null,
    repairedLegacyKeyTerms: true,
  };
}

/** True when the question is an open-ended (short-answer) item. */
export function isShortAnswerQuestion(question: Question): boolean {
  return question.questionType === "open-ended";
}

/**
 * Load-time guard (research R8): keep MCQs as-is; keep open-ended questions
 * only when their `shortAnswer` payload passes structural validation, so a
 * corrupt payload can never crash the practice UI.
 */
export function filterRenderableQuestions(questions: Question[]): Question[] {
  return questions.flatMap((question) => {
    if (!isShortAnswerQuestion(question)) return [question];
    const resolved = resolveRuntimeShortAnswerItem(question.shortAnswer);
    if (!resolved.item) {
      console.warn(
        `[short-answer] dropping invalid item ${question.id}: ${resolved.error ?? "missing short-answer payload"}`,
      );
      return [];
    }
    if (!resolved.repairedLegacyKeyTerms) return [question];
    return [{ ...question, shortAnswer: resolved.item }];
  });
}
