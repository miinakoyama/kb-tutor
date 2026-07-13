import { describe, expect, it } from "vitest";
import { parseArgs, parseClassifierBatch } from "./classify-legacy-kcs";

describe("legacy KC classifier contract", () => {
  it("parses deterministic preview scope", () => {
    expect(parseArgs(["--sample", "24", "--self-practice", "--standards", "A,B"])).toMatchObject({
      sample: 24,
      selfPractice: true,
      standards: ["A", "B"],
      resume: null,
    });
  });

  it("accepts only standard-local assigned KCs", () => {
    const question = {
      questionSetId: "set",
      questionId: "q1",
      standardId: "S",
      contentHash: "a".repeat(64),
      text: "Question",
      options: [],
      correctOptionId: "a",
      explanation: "",
    };
    expect(
      parseClassifierBatch(
        JSON.stringify({ decisions: [{ questionId: "q1", outcome: "assigned", kcCode: "S1", rationale: "Directly assessed." }] }),
        [question],
        new Map([["S", new Set(["S1"])]]),
      )[0].kcCode,
    ).toBe("S1");
    expect(() =>
      parseClassifierBatch(
        JSON.stringify({ decisions: [{ questionId: "q1", outcome: "assigned", kcCode: "T1", rationale: "Wrong standard." }] }),
        [question],
        new Map([["S", new Set(["S1"])]]),
      ),
    ).toThrow("not active");
  });
});
