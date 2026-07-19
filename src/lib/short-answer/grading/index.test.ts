import { beforeEach, describe, expect, it, vi } from "vitest";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";

const chatComplete = vi.fn();
vi.mock("@/lib/llm/client", () => ({
  chatComplete: (...args: unknown[]) => chatComplete(...args),
}));

async function load() {
  return import("./index");
}

const item = sampleItem as ShortAnswerItem;
const partA = item.parts[0];

const baseParams = {
  method: "2" as const,
  modelId: "gpt-5.4",
  temperature: 1,
  item,
  part: partA,
  studentResponse: "It's DNA.",
};

function jsonCompletion(content: unknown, tokenCount = 10) {
  return { content: JSON.stringify(content), tokenCount };
}

describe("gradePart", () => {
  beforeEach(() => {
    vi.resetModules();
    chatComplete.mockReset();
  });

  it("returns feedback and the canonical model answer for an incorrect exam response", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 0, failure_type: "wrong_concept" }))
      .mockResolvedValueOnce(
        jsonCompletion({ feedback: "You said DNA, but this asks about the messenger molecule." }),
      );

    const { gradePart } = await load();
    const result = await gradePart({
      ...baseParams,
      attemptNumber: 1,
      maxAttempts: 1,
    });

    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(chatComplete.mock.calls[1]?.[0])).toContain(
      "FINAL SUBMISSION CONTEXT",
    );
    expect(result.correct).toBe(false);
    expect(result.feedback).toEqual({
      verdict: "heres_the_idea",
      segments: [
        {
          label: "Feedback",
          text: "You said DNA, but this asks about the messenger molecule.",
        },
      ],
      modelAnswer: "mRNA carries the genetic code from the nucleus to the ribosome.",
    });
  });

  it("keeps Socratic method feedback while a practice retry remains", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 0, failure_type: "wrong_concept" }))
      .mockResolvedValueOnce(
        jsonCompletion({ feedback: "You said DNA, but this asks about the messenger molecule." }),
      );

    const { gradePart } = await load();
    const result = await gradePart({ ...baseParams, attemptNumber: 1, maxAttempts: 2 });

    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(chatComplete.mock.calls[1]?.[0])).toContain(
      "RETRY CONTEXT",
    );
    expect(result.feedback.verdict).toBe("good_try");
    expect(result.feedback.segments[0].text).toContain("messenger molecule");
    expect(result.feedback.glossaryTerms).toBeDefined();
    expect(result.feedback.modelAnswer).toBeUndefined();
  });

  it("keeps feedback with the model answer after an incorrect second practice attempt", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 0, failure_type: "wrong_concept" }))
      .mockResolvedValueOnce(jsonCompletion({ feedback: "Still not the messenger molecule." }));

    const { gradePart } = await load();
    const result = await gradePart({
      ...baseParams,
      studentResponse: "still DNA",
      attemptNumber: 2,
      maxAttempts: 2,
    });

    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(result.feedback.segments).toEqual([
      { label: "Feedback", text: "Still not the messenger molecule." },
    ]);
    expect(result.feedback.modelAnswer).toBe(
      "mRNA carries the genetic code from the nucleus to the ribosome.",
    );
  });

  it("does not add a closure call for method 3 final misses", async () => {
    chatComplete.mockResolvedValueOnce(
      jsonCompletion({
        score: 0,
        feedback: "Reconsider the messenger.",
        confidence: "medium",
      }),
    );

    const { gradePart } = await load();
    const result = await gradePart({
      ...baseParams,
      method: "3",
      attemptNumber: 2,
      maxAttempts: 2,
    });

    expect(chatComplete).toHaveBeenCalledTimes(1);
    expect(result.feedback.segments).toEqual([
      { label: "Feedback", text: "Reconsider the messenger." },
    ]);
    expect(result.feedback.modelAnswer).toBe(
      "mRNA carries the genetic code from the nucleus to the ribosome.",
    );
  });

  it("correct answers keep the method's confirming feedback", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 1, failure_type: null }))
      .mockResolvedValueOnce(
        jsonCompletion({ feedback: "Correct — mRNA is the messenger molecule." }),
      );

    const { gradePart } = await load();
    const result = await gradePart({
      ...baseParams,
      studentResponse: "mRNA",
      attemptNumber: 1,
      maxAttempts: 1,
    });

    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(result.correct).toBe(true);
    expect(result.feedback.verdict).toBe("correct");
  });
});
