import { describe, expect, it } from "vitest";
import { buildGenerationPrompt } from "@/lib/prompts";
import { getKCsByStandard } from "@/lib/short-answer/generation/data";

describe("buildGenerationPrompt KC context", () => {
  it("includes the allowed KC catalog for every standard in a multi-standard request", () => {
    const prompt = buildGenerationPrompt({
      questionSetName: "Multi-standard set",
      questionCount: 2,
      topics: [],
      standards: ["3.1.9-12.A", "3.1.9-12.B"],
      standardCounts: { "3.1.9-12.A": 1, "3.1.9-12.B": 1 },
      dokLevels: [2],
      includeDiagrams: false,
      customPrompt: "",
    });

    const kcA = getKCsByStandard("3.1.9-12.A")[0];
    const kcB = getKCsByStandard("3.1.9-12.B")[0];
    expect(kcA).toBeDefined();
    expect(kcB).toBeDefined();
    expect(prompt).toContain(`${kcA.code}: ${kcA.statement}`);
    expect(prompt).toContain(`${kcB.code}: ${kcB.statement}`);
    expect(prompt).toContain("Never use a KC from a different standard or invent a code.");
  });
});
