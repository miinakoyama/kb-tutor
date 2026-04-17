import type { GlossaryTerm } from "@/types/question";

const DEFAULT_MAX_TERMS = 8;

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 48);
  return slug || "term";
}

function normalizeId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64);
  return normalized || "term";
}

export function normalizeGlossaryTerms(
  raw: unknown,
  seed: string,
  maxTerms: number = DEFAULT_MAX_TERMS,
): GlossaryTerm[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const terms: GlossaryTerm[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < raw.length; index++) {
    const entry = raw[index];
    if (!entry || typeof entry !== "object") continue;
    const term = entry as Record<string, unknown>;

    const label = toTrimmedString(term.term);
    const definition = toTrimmedString(term.definition);
    if (!label || !definition) continue;

    const rawId = toTrimmedString(term.id);
    const id = normalizeId(rawId ?? `${seed}-${toSlug(label)}-${index + 1}`);
    if (seenIds.has(id)) continue;

    const glossaryTerm: GlossaryTerm = {
      id,
      term: label,
      definition,
    };

    const example = toTrimmedString(term.example);
    if (example) glossaryTerm.example = example;

    if (term.imageUrl === null) {
      glossaryTerm.imageUrl = null;
    } else {
      const imageUrl = toTrimmedString(term.imageUrl);
      if (imageUrl) glossaryTerm.imageUrl = imageUrl;
    }

    if (Array.isArray(term.relatedConcepts)) {
      const relatedConcepts = Array.from(
        new Set(
          term.relatedConcepts
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        ),
      ).slice(0, 8);
      if (relatedConcepts.length > 0) {
        glossaryTerm.relatedConcepts = relatedConcepts;
      }
    }

    terms.push(glossaryTerm);
    seenIds.add(id);
    if (terms.length >= maxTerms) break;
  }

  return terms.length > 0 ? terms : undefined;
}

export function dedupeSidebarTermsAgainstInline(
  inlineTerms: GlossaryTerm[] | undefined,
  sidebarTerms: GlossaryTerm[] | undefined,
): GlossaryTerm[] | undefined {
  if (!sidebarTerms || sidebarTerms.length === 0) return undefined;
  if (!inlineTerms || inlineTerms.length === 0) return sidebarTerms;

  const inlineIds = new Set(inlineTerms.map((term) => term.id));
  const inlineLabels = new Set(
    inlineTerms.map((term) => term.term.toLowerCase()),
  );
  const deduped = sidebarTerms.filter((term) => {
    if (inlineIds.has(term.id)) return false;
    if (inlineLabels.has(term.term.toLowerCase())) return false;
    return true;
  });
  return deduped.length > 0 ? deduped : undefined;
}

export function normalizeQuestionGlossaryTerms(
  rawInlineTerms: unknown,
  rawSidebarTerms: unknown,
  seed: string,
  maxTerms: number = DEFAULT_MAX_TERMS,
): {
  inlineTerms: GlossaryTerm[] | undefined;
  sidebarTerms: GlossaryTerm[] | undefined;
} {
  const inlineTerms = normalizeGlossaryTerms(
    rawInlineTerms,
    `${seed}-inline`,
    maxTerms,
  );
  const sidebarTermsRaw = normalizeGlossaryTerms(
    rawSidebarTerms,
    `${seed}-sidebar`,
    maxTerms,
  );
  const sidebarTerms = dedupeSidebarTermsAgainstInline(
    inlineTerms,
    sidebarTermsRaw,
  );
  return { inlineTerms, sidebarTerms };
}
