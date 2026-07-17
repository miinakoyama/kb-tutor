import { describe, expect, it } from "vitest";
import {
  freezeSelectedQuestions,
  parseArgs,
  parseClassifierBatch,
} from "./classify-legacy-kcs";

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
        JSON.stringify({ decisions: [{ questionSetId: "set", questionId: "q1", outcome: "assigned", kcCode: "S1", rationale: "Directly assessed." }] }),
        [question],
        new Map([["S", new Set(["S1"])]]),
      )[0].kcCode,
    ).toBe("S1");
    expect(() =>
      parseClassifierBatch(
        JSON.stringify({ decisions: [{ questionSetId: "set", questionId: "q1", outcome: "assigned", kcCode: "T1", rationale: "Wrong standard." }] }),
        [question],
        new Map([["S", new Set(["S1"])]]),
      ),
    ).toThrow("not active");
  });

  it("distinguishes duplicate question IDs in different sets", () => {
    const expected = ["set-a", "set-b"].map((questionSetId) => ({
      questionSetId,
      questionId: "q1",
      standardId: "S",
      contentHash: "a".repeat(64),
      text: "Question",
      options: [],
      correctOptionId: "a",
      explanation: "",
    }));
    const decisions = parseClassifierBatch(
      JSON.stringify({
        decisions: expected.map(({ questionSetId, questionId }) => ({
          questionSetId,
          questionId,
          outcome: "assigned",
          kcCode: "S1",
          rationale: "Directly assessed.",
        })),
      }),
      expected,
      new Map([["S", new Set(["S1"])]]),
    );

    expect(decisions.map((decision) => decision.questionSetId)).toEqual([
      "set-a",
      "set-b",
    ]);
  });

  it("rejects classifier decisions without a non-empty question set id", () => {
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

    expect(() =>
      parseClassifierBatch(
        JSON.stringify({
          decisions: [{
            questionId: "q1",
            outcome: "assigned",
            kcCode: "S1",
            rationale: "Directly assessed.",
          }],
        }),
        [question],
        new Map([["S", new Set(["S1"])]]),
      ),
    ).toThrow("missing questionSetId");

    expect(() =>
      parseClassifierBatch(
        JSON.stringify({
          decisions: [{
            questionSetId: "   ",
            questionId: "q1",
            outcome: "assigned",
            kcCode: "S1",
            rationale: "Directly assessed.",
          }],
        }),
        [question],
        new Map([["S", new Set(["S1"])]]),
      ),
    ).toThrow("missing questionSetId");
  });

  it("drops cross-product rows outside the frozen composite scope", () => {
    const payload = {
      standardId: "S",
      questionType: "mcq",
      text: "Question",
      options: [],
      correctOptionId: "a",
    };
    const frozen = freezeSelectedQuestions(
      [
        { set_id: "set-a", id: "q1", payload },
        { set_id: "set-a", id: "q2", payload },
        { set_id: "set-b", id: "q1", payload },
        { set_id: "set-b", id: "q2", payload },
      ],
      [
        { questionSetId: "set-a", questionId: "q1", contentHash: "a".repeat(64) },
        { questionSetId: "set-b", questionId: "q2", contentHash: "b".repeat(64) },
      ],
    );

    expect(frozen.map((question) => [question.questionSetId, question.questionId])).toEqual([
      ["set-a", "q1"],
      ["set-b", "q2"],
    ]);
    expect(frozen.map((question) => question.contentHash)).toEqual([
      "a".repeat(64),
      "b".repeat(64),
    ]);
  });
});
