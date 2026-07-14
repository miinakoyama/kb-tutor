import { describe, expect, it } from "vitest";
import {
  extractEmbeddedKcMappings,
  stableQuestionContent,
  validateEmbeddedKcMappings,
} from "@/lib/bkt/mappings";
import type { Question } from "@/types/question";

function mcq(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    module: 1,
    topic: "Genetics",
    standardId: "3.1.9-12.A",
    text: "Which process makes mRNA?",
    imageUrl: null,
    options: [
      { id: "a", text: "Transcription" },
      { id: "b", text: "Translation" },
    ],
    correctOptionId: "a",
    kcCode: "3.1.9-12.A2",
    source: "generated",
    ...overrides,
  };
}

describe("embedded KC mappings", () => {
  it("extracts one MCQ mapping", () => {
    expect(extractEmbeddedKcMappings(mcq())).toEqual([
      {
        format: "mcq",
        partLabel: null,
        standardId: "3.1.9-12.A",
        kcCode: "3.1.9-12.A2",
      },
    ]);
  });

  it("rejects missing and cross-standard MCQ mappings", () => {
    expect(validateEmbeddedKcMappings(mcq({ kcCode: undefined }), new Set())).toContain(
      "An MCQ must have exactly one KC mapping.",
    );
    expect(
      validateEmbeddedKcMappings(
        mcq({ kcCode: "3.1.9-12.B2" }),
        new Set(["3.1.9-12.B2"]),
      ),
    ).toContain("KC 3.1.9-12.B2 does not belong to standard 3.1.9-12.A.");
  });

  it("serializes content deterministically", () => {
    expect(stableQuestionContent(mcq())).toBe(stableQuestionContent({ ...mcq() }));
  });
});
