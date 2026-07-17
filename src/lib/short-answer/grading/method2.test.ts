import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";

const chatComplete = vi.fn();
vi.mock("@/lib/llm/client", () => ({
  chatComplete: (...args: unknown[]) => chatComplete(...args),
}));

const item = sampleItem as ShortAnswerItem;
const part = item.parts[0];

async function load() {
  return import("@/lib/short-answer/grading/method2");
}

describe("gradeWithMethod2", () => {
  beforeEach(() => {
    vi.resetModules();
    chatComplete.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("makes two calls (score then feedback) and aggregates tokens", async () => {
    chatComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ score: 1, failure_type: null }),
        tokenCount: 10,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ feedback: "Yes, mRNA is exactly right." }),
        tokenCount: 5,
      });
    const { gradeWithMethod2 } = await load();
    const result = await gradeWithMethod2({
      item,
      part,
      studentResponse: "mRNA carries the code",
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(result.score).toBe(1);
    expect(result.feedback).toBe("Yes, mRNA is exactly right.");
    expect(result.tokenCount).toBe(15);
  });

  it("clamps an out-of-range score and extracts nested feedback", async () => {
    chatComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ score: 9, failure_type: null }),
        tokenCount: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ feedback: { message: "nested text" } }),
        tokenCount: 0,
      });
    const { gradeWithMethod2 } = await load();
    const result = await gradeWithMethod2({
      item,
      part,
      studentResponse: "something",
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(result.score).toBe(part.maxScore);
    expect(result.feedback).toBe("nested text");
  });

  it("carries the failure type as the diagnosed gap on a zero score", async () => {
    chatComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ score: 0, failure_type: "wrong_concept" }),
        tokenCount: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ feedback: "Not quite — reconsider." }),
        tokenCount: 0,
      });
    const { gradeWithMethod2 } = await load();
    const result = await gradeWithMethod2({
      item,
      part,
      studentResponse: "DNA",
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(result.score).toBe(0);
    expect(result.diagnosedGap).toBe("wrong_concept");
  });
});
