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
  return import("@/lib/short-answer/grading/method3");
}

describe("gradeWithMethod3", () => {
  beforeEach(() => {
    vi.resetModules();
    chatComplete.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("parses feedback, score and confidence from a single call", async () => {
    chatComplete.mockResolvedValue({
      content: JSON.stringify({
        error_analysis: {},
        feedback: "Reconsider which molecule leaves the nucleus.",
        score: 0,
        confidence: "high",
      }),
      tokenCount: 20,
    });
    const { gradeWithMethod3 } = await load();
    const result = await gradeWithMethod3({
      item,
      part,
      studentResponse: "DNA",
      modelId: "claude-sonnet-4-6",
      temperature: 0,
    });
    expect(result.score).toBe(0);
    expect(result.confidence).toBe("high");
    expect(result.feedback).toMatch(/molecule/);
  });

  it("defaults confidence to medium and supplies fallback feedback", async () => {
    chatComplete.mockResolvedValue({
      content: JSON.stringify({ score: 0 }),
      tokenCount: 0,
    });
    const { gradeWithMethod3 } = await load();
    const result = await gradeWithMethod3({
      item,
      part,
      studentResponse: "not sure",
      modelId: "claude-sonnet-4-6",
      temperature: 0,
    });
    expect(result.confidence).toBe("medium");
    expect(result.feedback.length).toBeGreaterThan(0);
  });
});
