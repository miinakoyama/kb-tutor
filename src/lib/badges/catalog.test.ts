import { describe, expect, it } from "vitest";
import { PROGRESS_TOPICS } from "@/lib/progress/mastery";
import {
  BADGE_CATALOG,
  getModuleCodeForTarget,
  getProgressTopicForTarget,
  getTopicTargetIdsForModuleTarget,
} from "@/lib/badges/catalog";

describe("BADGE_CATALOG", () => {
  it("defines exactly 23 badges with unique ids", () => {
    expect(BADGE_CATALOG).toHaveLength(23);
    expect(new Set(BADGE_CATALOG.map((b) => b.id)).size).toBe(23);
  });
});

describe("getProgressTopicForTarget", () => {
  it("maps module1_topicN / module2_topicN onto PROGRESS_TOPICS in curriculum order", () => {
    expect(getProgressTopicForTarget("module1_topic1")).toEqual(PROGRESS_TOPICS[0]);
    expect(getProgressTopicForTarget("module1_topic3")).toEqual(PROGRESS_TOPICS[2]);
    expect(getProgressTopicForTarget("module2_topic1")).toEqual(PROGRESS_TOPICS[3]);
    expect(getProgressTopicForTarget("module2_topic3")).toEqual(PROGRESS_TOPICS[5]);
  });

  it("returns undefined for an unknown target", () => {
    expect(getProgressTopicForTarget("module3_topic1")).toBeUndefined();
  });
});

describe("getModuleCodeForTarget", () => {
  it("maps module1/module2 to ModuleCode A/B", () => {
    expect(getModuleCodeForTarget("module1")).toBe("A");
    expect(getModuleCodeForTarget("module2")).toBe("B");
  });
});

describe("getTopicTargetIdsForModuleTarget", () => {
  it("returns the 3 topic targets belonging to each module, in order", () => {
    expect(getTopicTargetIdsForModuleTarget("module1")).toEqual([
      "module1_topic1",
      "module1_topic2",
      "module1_topic3",
    ]);
    expect(getTopicTargetIdsForModuleTarget("module2")).toEqual([
      "module2_topic1",
      "module2_topic2",
      "module2_topic3",
    ]);
  });

  it("returns an empty array for an unknown module target", () => {
    expect(getTopicTargetIdsForModuleTarget("module9")).toEqual([]);
  });
});
