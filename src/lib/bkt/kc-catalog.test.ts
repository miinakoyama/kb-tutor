import { describe, expect, it } from "vitest";
import { kcBelongsToStandard, validateKcCode } from "@/lib/bkt/kc-catalog";
import type { KnowledgeComponent } from "@/types/bkt";

const catalog: KnowledgeComponent[] = [
  {
    code: "3.1.9-12.A2",
    standardId: "3.1.9-12.A",
    shortCode: "A2",
    statement: "Describe transcription.",
    vocabulary: ["mRNA"],
    catalogOrder: 2,
    active: true,
  },
];

describe("KC catalog guards", () => {
  it("checks standard membership without confusing A with A2", () => {
    expect(kcBelongsToStandard("3.1.9-12.A2", "3.1.9-12.A")).toBe(true);
    expect(kcBelongsToStandard("3.1.9-12.B2", "3.1.9-12.A")).toBe(false);
  });

  it("returns only an active exact same-standard KC", () => {
    expect(validateKcCode(catalog, "3.1.9-12.A2", "3.1.9-12.A")?.shortCode).toBe("A2");
    expect(validateKcCode(catalog, "3.1.9-12.A2", "3.1.9-12.B")).toBeNull();
  });
});
