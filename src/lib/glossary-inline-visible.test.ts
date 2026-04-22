import { describe, expect, it } from "vitest";
import {
  getFirstVisibleInlineTermId,
  stemHasVisibleInlineGlossary,
} from "@/lib/glossary-inline-visible";
import type { GlossaryTerm } from "@/types/question";

function term(id: string, t: string): GlossaryTerm {
  return { id, term: t, definition: "def" };
}

describe("stemHasVisibleInlineGlossary", () => {
  it("returns false when there are no inline terms", () => {
    expect(stemHasVisibleInlineGlossary("Hello world", undefined)).toBe(false);
    expect(stemHasVisibleInlineGlossary("Hello world", [])).toBe(false);
  });

  it("returns false when terms never appear in the stem", () => {
    const terms = [term("1", "photosynthesis")];
    expect(stemHasVisibleInlineGlossary("Hello world", terms)).toBe(false);
  });

  it("returns true when a term appears as a whole word", () => {
    const terms = [term("1", "cell")];
    expect(stemHasVisibleInlineGlossary("The cell divides.", terms)).toBe(true);
  });

  it("is case-insensitive", () => {
    const terms = [term("1", "DNA")];
    expect(stemHasVisibleInlineGlossary("Study dna structure.", terms)).toBe(true);
  });

  it("returns false for substring without word boundary", () => {
    const terms = [term("1", "cat")];
    expect(stemHasVisibleInlineGlossary("The category is wide.", terms)).toBe(false);
  });
});

describe("getFirstVisibleInlineTermId", () => {
  it("returns id of first matched term in stem order", () => {
    const terms = [term("a", "zoo"), term("b", "animal")];
    expect(getFirstVisibleInlineTermId("The zoo has an animal.", terms)).toBe("a");
  });

  it("returns null when nothing matches", () => {
    expect(getFirstVisibleInlineTermId("Hello", [term("x", "world")])).toBe(null);
  });
});
