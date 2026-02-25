import type { GlossaryTerm } from "@/types/question";
import glossaryData from "@/data/glossary.json";

const allGlossaryTerms = glossaryData as GlossaryTerm[];

/**
 * Get glossary terms by their IDs
 */
export function getTermsById(ids: string[]): GlossaryTerm[] {
  return ids
    .map((id) => allGlossaryTerms.find((t) => t.id === id))
    .filter((t): t is GlossaryTerm => t !== undefined);
}

/**
 * Get all glossary terms
 */
export function getAllGlossaryTerms(): GlossaryTerm[] {
  return allGlossaryTerms;
}
