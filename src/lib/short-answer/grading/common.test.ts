import { describe, expect, it } from "vitest";
import {
  buildGradedFeedback,
  emptySubmissionFeedback,
  extractFeedbackText,
  normalizeScore,
  partFullCreditCriteria,
  partModelAnswer,
  selectGlossaryTerms,
} from "@/lib/short-answer/grading/common";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem, ShortAnswerPart } from "@/types/short-answer";

const item = sampleItem as ShortAnswerItem;
const partA = item.parts[0];

describe("normalizeScore", () => {
  it("clamps and rounds to [0, maxScore]", () => {
    expect(normalizeScore(2.6, 1)).toBe(1);
    expect(normalizeScore(-3, 1)).toBe(0);
    expect(normalizeScore("bad", 1)).toBe(0);
    expect(normalizeScore(0.4, 3)).toBe(0);
  });
});

describe("extractFeedbackText", () => {
  it("pulls a string from nested objects and arrays", () => {
    expect(extractFeedbackText({ feedback: "hi" })).toBe("hi");
    expect(extractFeedbackText(["a", "b"])).toBe("a b");
    expect(extractFeedbackText({ nested: { message: "deep" } })).toBe("deep");
    expect(extractFeedbackText({})).toBeNull();
  });
});

describe("buildGradedFeedback", () => {
  it("returns a correct verdict with a single confirming segment and no model answer", () => {
    const fb = buildGradedFeedback({
      rawFeedback: "Yes, mRNA is exactly right.",
      correct: true,
      isFinalAttempt: true,
      item,
      part: partA,
      attemptsRemaining: 0,
      studentResponse: "It's mRNA.",
    });
    expect(fb.verdict).toBe("correct");
    expect(fb.segments).toHaveLength(1);
    expect(fb.modelAnswer).toBeUndefined();
  });

  it("returns a single feedback paragraph on a non-final miss", () => {
    const fb = buildGradedFeedback({
      rawFeedback:
        "You named DNA, but this part asks about the messenger molecule. What travels to the ribosome?",
      correct: false,
      isFinalAttempt: false,
      item,
      part: partA,
      attemptsRemaining: 1,
      studentResponse: "It's DNA.",
    });
    expect(fb.verdict).toBe("good_try");
    expect(fb.segments).toHaveLength(1);
    expect(fb.segments[0].label).toBe("");
    expect(fb.segments[0].text).toContain("messenger molecule");
    // A non-final miss still has retries, so no model answer is revealed yet.
    expect(fb.modelAnswer).toBeUndefined();
    expect(Array.isArray(fb.glossaryTerms)).toBe(true);
  });

  it("selects glossary terms missing from the student's own response, not the feedback text", () => {
    const fb = buildGradedFeedback({
      rawFeedback:
        "You named DNA, but this part asks about the messenger molecule. What travels to the ribosome?",
      correct: false,
      isFinalAttempt: false,
      item,
      part: partA,
      attemptsRemaining: 1,
      studentResponse: "I think the mRNA travels there.",
    });
    expect(fb.glossaryTerms).not.toContain("mRNA");
    expect(fb.glossaryTerms).toContain("codon");
    expect(fb.glossaryTerms).toContain("translation");
  });

  it("shows only the model answer on a final incorrect attempt", () => {
    const fb = buildGradedFeedback({
      rawFeedback:
        "Thanks for revising. The messenger RNA carries the genetic code from the nucleus to the ribosome.",
      correct: false,
      isFinalAttempt: true,
      item,
      part: partA,
      attemptsRemaining: 0,
      studentResponse: "I think it might be DNA still.",
    });
    expect(fb.verdict).toBe("heres_the_idea");
    expect(fb.segments).toHaveLength(0);
    // The model answer is sourced from this part's segment of the score-max
    // annotated response (data-model.md), not the rubric criterion.
    expect(fb.modelAnswer).toBe(
      "mRNA carries the genetic code from the nucleus to the ribosome.",
    );
    expect(fb.modelAnswer).not.toContain("Part B");
  });
});

describe("partModelAnswer", () => {
  it("extracts this part's segment from the score-max annotated response", () => {
    expect(partModelAnswer(item, partA)).toBe(
      "mRNA carries the genetic code from the nucleus to the ribosome.",
    );
    expect(partModelAnswer(item, item.parts[1])).toContain("codon");
    expect(partModelAnswer(item, item.parts[1])).not.toContain("Part");
  });

  it("falls back to full-credit criteria when the response is not part-keyed", () => {
    const noAnnotations: ShortAnswerItem = { ...item, annotatedResponses: [] };
    expect(partModelAnswer(noAnnotations, partA)).toBe(
      partFullCreditCriteria(partA),
    );
  });

  it("maps safely separable unkeyed sample clauses to parts in order", () => {
    const unkeyedItem: ShortAnswerItem = {
      ...item,
      annotatedResponses: item.annotatedResponses.map((response) =>
        response.score === 3
          ? {
              ...response,
              response:
                "DNA stores the instructions; base order sets amino-acid order; a base change can alter the protein.",
            }
          : response,
      ),
    };

    expect(partModelAnswer(unkeyedItem, unkeyedItem.parts[0])).toBe(
      "DNA stores the instructions.",
    );
    expect(partModelAnswer(unkeyedItem, unkeyedItem.parts[1])).toBe(
      "base order sets amino-acid order.",
    );
    expect(partModelAnswer(unkeyedItem, unkeyedItem.parts[2])).toBe(
      "a base change can alter the protein.",
    );
  });

  it("does not reveal an inseparable whole-item answer for an earlier part", () => {
    const ambiguousItem: ShortAnswerItem = {
      ...item,
      annotatedResponses: item.annotatedResponses.map((response) =>
        response.score === 3
          ? { ...response, response: "DNA controls how the complete process works." }
          : response,
      ),
    };

    expect(partModelAnswer(ambiguousItem, ambiguousItem.parts[0])).toBe(
      partFullCreditCriteria(ambiguousItem.parts[0]),
    );
  });
});

describe("partFullCreditCriteria", () => {
  it("does not crash for a legacy part with scoringGuidance and no rubric", () => {
    // `rubric` is omitted at runtime for legacy scoring-guidance-only items.
    const legacyPart = {
      ...partA,
      rubric: undefined,
      scoringGuidance: "Names mRNA as the messenger molecule.",
    } as unknown as ShortAnswerPart;
    expect(partFullCreditCriteria(legacyPart)).toBe(
      "Names mRNA as the messenger molecule.",
    );
    // And a rubric-less part still yields a model answer end-to-end.
    const legacyItem: ShortAnswerItem = {
      ...item,
      parts: [legacyPart, item.parts[1], item.parts[2]],
      annotatedResponses: [],
    };
    expect(() => partModelAnswer(legacyItem, legacyPart)).not.toThrow();
  });
});

describe("selectGlossaryTerms", () => {
  it("returns key terms not already present in the response", () => {
    const terms = selectGlossaryTerms(item, "I think it is the ribosome");
    expect(terms).toContain("mRNA");
    expect(terms.length).toBeLessThanOrEqual(3);
  });
});

describe("emptySubmissionFeedback", () => {
  it("uses the no_response verdict", () => {
    expect(emptySubmissionFeedback().verdict).toBe("no_response");
  });
});
