import { beforeEach, describe, expect, it, vi } from "vitest";

const chatComplete = vi.fn();
vi.mock("@/lib/llm/client", () => ({
  chatComplete: (...args: unknown[]) => chatComplete(...args),
}));

async function load() {
  return import("./attempt2");
}

describe("attempt2 feedback pipeline", () => {
  beforeEach(() => {
    vi.resetModules();
    chatComplete.mockReset();
  });

  it("classifies not_at_all and generates closure feedback", async () => {
    chatComplete
      .mockResolvedValueOnce({ content: "not_at_all", tokenCount: 5 })
      .mockResolvedValueOnce({
        content: "Thanks for trying again. Gene expression turns DNA information into proteins.",
        tokenCount: 20,
      });

    const { buildAttempt2StudentFeedback } = await load();
    const result = await buildAttempt2StudentFeedback({
      attempt1Feedback: "What molecule carries the code to the ribosome?",
      attempt1Gap: "Student named DNA instead of mRNA.",
      fullCreditCriteria: "Names mRNA as the molecule that carries the code to the ribosome.",
      itemStem: "Cells use DNA to build proteins.",
      partLabel: "A",
      partPrompt: "Name the messenger molecule.",
      studentResponse: "still DNA",
      modelId: "gpt-5.4",
      temperature: 1,
    });

    expect(result.resolution).toBe("not_at_all");
    expect(result.feedback).toContain("Gene expression");
    expect(chatComplete).toHaveBeenCalledTimes(2);
    // The classification call must use the configured temperature, not a
    // hardcoded 0 — reasoning-class models (e.g. gpt-5.4) reject any
    // temperature other than their default and would throw otherwise.
    expect(chatComplete.mock.calls[0][0].temperature).toBe(1);
    expect(chatComplete.mock.calls[1][0].messages[0].content).toContain(
      "HARD CONSTRAINT",
    );
    // The generator must be handed the full-credit criteria so it can teach the
    // model answer even when the method diagnosed no usable gap.
    expect(chatComplete.mock.calls[1][0].messages[1].content).toContain(
      "Names mRNA as the molecule",
    );
  });

  it("classifies fully for a revised correct response", async () => {
    chatComplete
      .mockResolvedValueOnce({ content: "fully", tokenCount: 4 })
      .mockResolvedValueOnce({
        content: "Nice improvement. You correctly identified mRNA as the messenger.",
        tokenCount: 18,
      });

    const { buildAttempt2StudentFeedback } = await load();
    const result = await buildAttempt2StudentFeedback({
      attempt1Feedback: "Think about the molecule that leaves the nucleus.",
      attempt1Gap: "Missing messenger RNA.",
      fullCreditCriteria: "Names mRNA as the molecule that carries the code to the ribosome.",
      itemStem: "Cells use DNA to build proteins.",
      partLabel: "A",
      partPrompt: "Name the messenger molecule.",
      studentResponse: "mRNA carries the code to the ribosome",
      modelId: "gpt-5.4",
      temperature: 1,
    });

    expect(result.resolution).toBe("fully");
    expect(result.feedback).toContain("mRNA");
  });
});
