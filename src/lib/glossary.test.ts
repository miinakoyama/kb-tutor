import { describe, expect, it } from "vitest";
import { normalizeGlossaryTerms } from "@/lib/glossary";

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
