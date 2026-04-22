import type { GlossaryTerm } from "@/types/question";

/**
 * Returns true when at least one inline glossary term would render as an
 * interactive (green) token in the question stem — same word-boundary rules as
 * AdaptivePracticeMode's `renderQuestionText`.
 */
export function stemHasVisibleInlineGlossary(
  questionText: string,
  inlineTerms: GlossaryTerm[] | undefined,
): boolean {
  if (!inlineTerms || inlineTerms.length === 0) return false;

  const inlineTermMap = new Map<string, GlossaryTerm>();
  for (const term of inlineTerms) {
    inlineTermMap.set(term.term.toLowerCase(), term);
  }

  const keys = Array.from(inlineTermMap.keys()).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return false;

  const pattern = new RegExp(
    `\\b(${keys.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "gi",
  );

  const parts = questionText.split(pattern);
  return parts.some((part) => inlineTermMap.has(part.toLowerCase()));
}

/** First inline term that would render in reading order in the stem, or null. */
export function getFirstVisibleInlineTermId(
  questionText: string,
  inlineTerms: GlossaryTerm[] | undefined,
): string | null {
  if (!inlineTerms || inlineTerms.length === 0) return null;

  const inlineTermMap = new Map<string, GlossaryTerm>();
  for (const term of inlineTerms) {
    inlineTermMap.set(term.term.toLowerCase(), term);
  }

  const keys = Array.from(inlineTermMap.keys()).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return null;

  const pattern = new RegExp(
    `\\b(${keys.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "gi",
  );

  const parts = questionText.split(pattern);
  for (const part of parts) {
    const term = inlineTermMap.get(part.toLowerCase());
    if (term) return term.id;
  }
  return null;
}
