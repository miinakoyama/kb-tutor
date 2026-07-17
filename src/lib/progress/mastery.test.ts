import { describe, expect, it } from "vitest";
import { getStandardsForModule } from "@/lib/standards";
import {
  calculateKcMastery,
  PROGRESS_TOPICS,
  type ActiveKc,
} from "@/lib/progress/mastery";

function getTopicKeyFromStandard(standardId: string): string {
  for (const { module } of PROGRESS_TOPICS) {
    const standard = getStandardsForModule(module).find((item) => item.id === standardId);
    if (standard) {
      return `Module ${standard.module} - ${standard.category}`;
    }
  }
  throw new Error("Standard id not found in PROGRESS_TOPICS");
}

describe("calculateKcMastery", () => {
  it("marks topics with no active KCs as insufficient_data", () => {
    const mastery = calculateKcMastery([], new Map());

    expect(mastery.length).toBeGreaterThan(0);
    expect(mastery.every((item) => item.level === "insufficient_data")).toBe(true);
    expect(mastery.every((item) => item.masteryValue === 0)).toBe(true);
  });

  it("falls back to the default unobserved probability for KCs with no mastery row", () => {
    const standard = getStandardsForModule("A")[0];
    const key = getTopicKeyFromStandard(standard.id);
    const activeKcs: ActiveKc[] = [{ code: "kc-1", standardId: standard.id }];

    const mastery = calculateKcMastery(activeKcs, new Map());
    const datum = mastery.find((item) => item.topic === key);

    expect(datum).toBeDefined();
    expect(datum?.masteryValue).toBe(30);
    expect(datum?.level).toBe("measured");
  });

  it("averages probability across every active KC in the topic", () => {
    const standard = getStandardsForModule("A")[0];
    const key = getTopicKeyFromStandard(standard.id);
    const activeKcs: ActiveKc[] = [
      { code: "kc-1", standardId: standard.id },
      { code: "kc-2", standardId: standard.id },
    ];
    const probabilityByKcCode = new Map([
      ["kc-1", 0.9],
      ["kc-2", 0.5],
    ]);

    const mastery = calculateKcMastery(activeKcs, probabilityByKcCode);
    const datum = mastery.find((item) => item.topic === key);

    expect(datum).toBeDefined();
    // (0.9 + 0.5) / 2 => 70%
    expect(datum?.masteryValue).toBe(70);
  });
});
