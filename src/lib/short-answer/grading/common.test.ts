import { describe, expect, it } from "vitest";
import {
  buildGradedFeedback,
  emptySubmissionFeedback,
  extractFeedbackText,
  normalizeScore,
  selectGlossaryTerms,
} from "@/lib/short-answer/grading/common";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";

const item = sampleItem as ShortAnswerItem;

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
      attemptsRemaining: 1,
      studentResponse: "It's DNA.",
    });
    expect(fb.verdict).toBe("good_try");
    expect(fb.segments).toHaveLength(1);
    expect(fb.segments[0].label).toBe("");
    expect(fb.segments[0].text).toContain("messenger molecule");
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
      attemptsRemaining: 1,
      studentResponse: "I think the mRNA travels there.",
    });
    expect(fb.glossaryTerms).not.toContain("mRNA");
    expect(fb.glossaryTerms).toContain("codon");
    expect(fb.glossaryTerms).toContain("translation");
  });

  it("shows LLM closure feedback (not a static model answer) on any final incorrect attempt", () => {
    const fb = buildGradedFeedback({
      rawFeedback:
        "Thanks for revising. The messenger RNA carries the genetic code from the nucleus to the ribosome.",
      correct: false,
      isFinalAttempt: true,
      item,
      attemptsRemaining: 0,
      studentResponse: "I think it might be DNA still.",
    });
    expect(fb.verdict).toBe("heres_the_idea");
    expect(fb.segments).toHaveLength(1);
    expect(fb.segments[0].text).toContain("messenger RNA");
    expect(fb.modelAnswer).toBeUndefined();
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
