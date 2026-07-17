import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";

const chatComplete = vi.fn();
const retrieveFromKB = vi.fn();
vi.mock("@/lib/llm/client", () => ({
  chatComplete: (...args: unknown[]) => chatComplete(...args),
}));
vi.mock("@/lib/short-answer/grading/retrieval", () => ({
  retrieveFromKB: (...args: unknown[]) => retrieveFromKB(...args),
}));

const item = sampleItem as ShortAnswerItem;
const part = item.parts[0];

async function load() {
  return import("@/lib/short-answer/grading/method1");
}

describe("gradeWithMethod1", () => {
  beforeEach(() => {
    vi.resetModules();
    chatComplete.mockReset();
    retrieveFromKB.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("scores and returns feedback, degrading gracefully without KB context", async () => {
    retrieveFromKB.mockResolvedValue(null);
    chatComplete.mockResolvedValue({
      content: JSON.stringify({
        reasoning: "correct concept present",
        score: 1,
        studentState: "correct",
        feedback: "Nice work, mRNA is exactly the molecule this asks for!",
        diagnosedGap: "none",
      }),
      tokenCount: 30,
    });
    const { gradeWithMethod1 } = await load();
    const result = await gradeWithMethod1({
      item,
      part,
      studentResponse: "mRNA",
      modelId: "claude-opus-4-8",
      temperature: 1,
    });
    expect(result.score).toBe(1);
    expect(result.feedback).toMatch(/mRNA/);
    expect(result.diagnosedGap).toBeUndefined();
  });

  it("keeps a real diagnosed gap on an incorrect answer", async () => {
    retrieveFromKB.mockResolvedValue({ kd1: "a", kd2: "b", ke: "c" });
    chatComplete.mockResolvedValue({
      content: JSON.stringify({
        score: 0,
        studentState: "wrong_concept",
        feedback: "DNA stores the code, but what carries it out of the nucleus?",
        diagnosedGap: "Student wrote DNA but mRNA is the carrier molecule.",
      }),
      tokenCount: 10,
    });
    const { gradeWithMethod1 } = await load();
    const result = await gradeWithMethod1({
      item,
      part,
      studentResponse: "DNA",
      modelId: "claude-opus-4-8",
      temperature: 1,
    });
    expect(result.score).toBe(0);
    expect(result.diagnosedGap).toContain("mRNA");
    expect(retrieveFromKB).toHaveBeenCalled();
  });
});
