import { describe, expect, it } from "vitest";
import {
  getKcCodesForTopicTarget,
  isModuleMastered,
  isPlatformMastered,
  isTopicMastered,
} from "@/lib/badges/mastery-scope";
import { getTopicTargetIdsForModuleTarget, MODULE_TARGET_IDS } from "@/lib/badges/catalog";

describe("getKcCodesForTopicTarget", () => {
  it("returns a non-empty KC code set for a real topic target", () => {
    const codes = getKcCodesForTopicTarget("module1_topic1");
    expect(codes.size).toBeGreaterThan(0);
  });

  it("returns an empty set for an unknown topic target", () => {
    expect(getKcCodesForTopicTarget("not_a_topic").size).toBe(0);
  });
});

describe("isTopicMastered", () => {
  it("is true only when every KC in the topic is mastered", () => {
    const topicCodes = getKcCodesForTopicTarget("module1_topic1");
    const allMastered = new Set(topicCodes);
    expect(isTopicMastered(allMastered, "module1_topic1")).toBe(true);

    const missingOne = new Set(topicCodes);
    missingOne.delete([...topicCodes][0]);
    expect(isTopicMastered(missingOne, "module1_topic1")).toBe(false);
  });

  it("is false for an unknown/empty topic (no KCs to require)", () => {
    expect(isTopicMastered(new Set(["anything"]), "not_a_topic")).toBe(false);
  });
});

describe("isModuleMastered", () => {
  it("requires every topic in the module to be mastered", () => {
    const topicIds = getTopicTargetIdsForModuleTarget("module1");
    const allCodes = new Set<string>();
    for (const topicId of topicIds) {
      for (const code of getKcCodesForTopicTarget(topicId)) allCodes.add(code);
    }

    expect(isModuleMastered(allCodes, "module1")).toBe(true);

    const partialCodes = new Set(getKcCodesForTopicTarget(topicIds[0]));
    expect(isModuleMastered(partialCodes, "module1")).toBe(false);
  });
});

describe("isPlatformMastered", () => {
  it("requires every module to be mastered", () => {
    const allCodes = new Set<string>();
    for (const moduleId of MODULE_TARGET_IDS) {
      for (const topicId of getTopicTargetIdsForModuleTarget(moduleId)) {
        for (const code of getKcCodesForTopicTarget(topicId)) allCodes.add(code);
      }
    }

    expect(isPlatformMastered(allCodes)).toBe(true);

    const module1Only = new Set<string>();
    for (const topicId of getTopicTargetIdsForModuleTarget("module1")) {
      for (const code of getKcCodesForTopicTarget(topicId)) module1Only.add(code);
    }
    expect(isPlatformMastered(module1Only)).toBe(false);
  });
});
