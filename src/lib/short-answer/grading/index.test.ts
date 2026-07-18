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

function textCompletion(content: string, tokenCount = 10) {
  return { content, tokenCount };
}

describe("gradePart", () => {
  beforeEach(() => {
    vi.resetModules();
    chatComplete.mockReset();
  });

  it("exam mode (single attempt, incorrect) generates real LLM closure feedback, not a static model answer", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 0, failure_type: "wrong_concept" }))
      .mockResolvedValueOnce(
        jsonCompletion({ feedback: "You said DNA, but this asks about the messenger molecule." }),
      )
      .mockResolvedValueOnce(
        textCompletion(
          "Nice try. The messenger RNA carries the code from the nucleus to the ribosome.",
        ),
      );

    const { gradePart } = await load();
    const result = await gradePart({
      ...baseParams,
      attemptNumber: 1,
      maxAttempts: 1,
    });

    expect(chatComplete).toHaveBeenCalledTimes(3);
    expect(result.correct).toBe(false);
    expect(result.feedback.verdict).toBe("heres_the_idea");
    expect(result.feedback.segments).toHaveLength(1);
    expect(result.feedback.segments[0].text).toContain("messenger RNA carries the code");
    expect(result.feedback.modelAnswer).toBeUndefined();
  });

  it("exam mode skips resolution classification (no genuine attempt 1 to compare against)", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 0, failure_type: "vague" }))
      .mockResolvedValueOnce(jsonCompletion({ feedback: "Can you be more specific?" }))
      .mockResolvedValueOnce(textCompletion("Here's the missing piece: mRNA."));

    const { gradePart } = await load();
    await gradePart({ ...baseParams, attemptNumber: 1, maxAttempts: 1 });

    // 2 calls for method 2's own scoring/feedback stages + exactly 1 closure
    // call — no extra classifyResolution round trip.
    expect(chatComplete).toHaveBeenCalledTimes(3);
    const closureCallMessages = chatComplete.mock.calls[2][0].messages;
    expect(closureCallMessages[0].content).toContain("not_at_all");
  });

  it("practice mode attempt 1 (retries remaining) keeps the method's own Socratic feedback, no closure call", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 0, failure_type: "wrong_concept" }))
      .mockResolvedValueOnce(
        jsonCompletion({ feedback: "You said DNA, but this asks about the messenger molecule." }),
      );

    const { gradePart } = await load();
    const result = await gradePart({ ...baseParams, attemptNumber: 1, maxAttempts: 2 });

    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(result.feedback.verdict).toBe("good_try");
    expect(result.feedback.segments[0].text).toContain("messenger molecule");
    expect(result.feedback.glossaryTerms).toBeDefined();
  });

  it("practice mode attempt 2 (real retry) classifies resolution then generates closure feedback", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 0, failure_type: "wrong_concept" }))
      .mockResolvedValueOnce(jsonCompletion({ feedback: "Still not the messenger molecule." }))
      .mockResolvedValueOnce(textCompletion("not_at_all"))
      .mockResolvedValueOnce(textCompletion("Thanks for revising. It's mRNA that carries the code."));

    const { gradePart } = await load();
    const result = await gradePart({
      ...baseParams,
      studentResponse: "still DNA",
      attemptNumber: 2,
      maxAttempts: 2,
      attempt1Feedback: "What travels to the ribosome?",
      attempt1Gap: "Named DNA instead of mRNA.",
    });

    expect(chatComplete).toHaveBeenCalledTimes(4);
    expect(result.feedback.verdict).toBe("heres_the_idea");
    expect(result.feedback.segments[0].text).toContain("mRNA that carries the code");
    // The closure generator must receive the part's full-credit criteria so it
    // can teach the model answer regardless of the grading method's gap quality.
    const closureUserMessage = chatComplete.mock.calls[3][0].messages[1].content;
    expect(closureUserMessage).toContain("CORRECT ANSWER");
  });

  it("method 3 attempt 2 (no diagnosed gap) still teaches the model answer via full-credit criteria", async () => {
    chatComplete
      // Method 3 scoring call: returns no diagnosedGap.
      .mockResolvedValueOnce(jsonCompletion({ score: 0, feedback: "Reconsider the messenger.", confidence: "medium" }))
      // classifyResolution
      .mockResolvedValueOnce(textCompletion("not_at_all"))
      // closure feedback
      .mockResolvedValueOnce(textCompletion("Good effort. The messenger molecule is mRNA."));

    const { gradePart } = await load();
    const result = await gradePart({
      ...baseParams,
      method: "3",
      studentResponse: "still DNA",
      attemptNumber: 2,
      maxAttempts: 2,
      attempt1Feedback: "What travels to the ribosome?",
      // Method 3 stored no gap on attempt 1.
      attempt1Gap: "",
    });

    expect(result.feedback.verdict).toBe("heres_the_idea");
    // The gap fed to classification/closure must NOT be the literal "Unknown
    // gap" placeholder — it must fall back to the part's full-credit criteria.
    const classifyUser = chatComplete.mock.calls[1][0].messages[1].content;
    expect(classifyUser).not.toContain("Unknown gap");
    const closureUser = chatComplete.mock.calls[2][0].messages[1].content;
    expect(closureUser).toContain("CORRECT ANSWER");
    expect(closureUser).not.toContain("Unknown gap");
  });

  it("correct answers never trigger the closure pipeline", async () => {
    chatComplete
      .mockResolvedValueOnce(jsonCompletion({ score: 1, failure_type: null }))
      .mockResolvedValueOnce(jsonCompletion({ feedback: "Correct — mRNA is the messenger molecule." }));

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
