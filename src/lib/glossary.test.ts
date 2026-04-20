import { describe, expect, it } from "vitest";
import {
  dedupeSidebarTermsAgainstInline,
  normalizeGlossaryTerms,
  normalizeQuestionGlossaryTerms,
} from "@/lib/glossary";

describe("normalizeGlossaryTerms", () => {
  it("returns undefined when input is not an array", () => {
    expect(normalizeGlossaryTerms(null, "seed")).toBeUndefined();
    expect(normalizeGlossaryTerms({}, "seed")).toBeUndefined();
  });

  it("normalizes valid terms and drops invalid rows", () => {
    const terms = normalizeGlossaryTerms(
      [
        { term: "  Osmosis ", definition: " water movement " },
        { term: " ", definition: "invalid" },
        { term: "Diffusion", definition: "Movement down gradient", example: "Gas exchange" },
      ],
      "bio",
    );

    expect(terms).toHaveLength(2);
    expect(terms?.[0]).toMatchObject({
      id: "bio-osmosis-1",
      term: "Osmosis",
      definition: "water movement",
    });
    expect(terms?.[1]).toMatchObject({
      id: "bio-diffusion-3",
      term: "Diffusion",
      definition: "Movement down gradient",
      example: "Gas exchange",
    });
  });

  it("deduplicates by normalized id", () => {
    const terms = normalizeGlossaryTerms(
      [
        { id: "ATP", term: "ATP", definition: "Cell energy" },
        { id: "atp", term: "ATP duplicate", definition: "Duplicate row" },
      ],
      "seed",
    );

    expect(terms).toHaveLength(1);
    expect(terms?.[0]).toMatchObject({
      id: "atp",
      term: "ATP",
      definition: "Cell energy",
    });
  });
});

describe("dedupeSidebarTermsAgainstInline", () => {
  it("removes sidebar terms duplicated in inline by id or term text", () => {
    const inlineTerms = [
      { id: "osmosis", term: "Osmosis", definition: "inline" },
    ];
    const sidebarTerms = [
      { id: "osmosis", term: "Osmosis duplicate", definition: "dup by id" },
      { id: "diffusion", term: "osmosis", definition: "dup by label" },
      { id: "atp", term: "ATP", definition: "kept" },
    ];

    const deduped = dedupeSidebarTermsAgainstInline(inlineTerms, sidebarTerms);

    expect(deduped).toHaveLength(1);
    expect(deduped?.[0]).toMatchObject({
      id: "atp",
      term: "ATP",
    });
  });
});

describe("normalizeQuestionGlossaryTerms", () => {
  it("normalizes inline/sidebar and removes cross-list duplicates", () => {
    const { inlineTerms, sidebarTerms } = normalizeQuestionGlossaryTerms(
      [{ id: "atp", term: "ATP", definition: "Energy molecule" }],
      [
        { id: "atp", term: "ATP duplicate", definition: "duplicate id" },
        { id: "mitochondrion", term: "Mitochondrion", definition: "Organelle" },
      ],
      "q1",
    );

    expect(inlineTerms).toHaveLength(1);
    expect(sidebarTerms).toHaveLength(1);
    expect(sidebarTerms?.[0]).toMatchObject({
      id: "mitochondrion",
      term: "Mitochondrion",
    });
  });
});
