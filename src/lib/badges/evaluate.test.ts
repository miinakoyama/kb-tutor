import { describe, expect, it } from "vitest";
import { evaluateEarnedBadges } from "@/lib/badges/evaluate";
import { getKcCodesForTopicTarget } from "@/lib/badges/mastery-scope";
import { getTopicTargetIdsForModuleTarget, MODULE_TARGET_IDS } from "@/lib/badges/catalog";
import type { SessionCountAttemptRow } from "@/lib/badges/session-counts";

const TZ = "UTC";

function isoDateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

describe("evaluateEarnedBadges", () => {
  it("earns nothing with no data", () => {
    const earned = evaluateEarnedBadges({ attempts: [], masteredKcCodes: new Set(), timeZone: TZ });
    expect(earned.size).toBe(0);
  });

  it("earns session-count badges based on distinct-day counts per mode", () => {
    const attempts: SessionCountAttemptRow[] = [
      { mode: "practice", assignmentId: null, answeredAt: "2020-01-01T10:00:00.000Z" },
    ];
    const earned = evaluateEarnedBadges({ attempts, masteredKcCodes: new Set(), timeZone: TZ });
    expect(earned.has("first_practice")).toBe(true);
    expect(earned.has("practice_5")).toBe(false);
    expect(earned.has("first_exam")).toBe(false);
  });

  it("earns topic/module/platform mastery badges based on aggregated KC mastery", () => {
    const allCodes = new Set<string>();
    for (const moduleId of MODULE_TARGET_IDS) {
      for (const topicId of getTopicTargetIdsForModuleTarget(moduleId)) {
        for (const code of getKcCodesForTopicTarget(topicId)) allCodes.add(code);
      }
    }

    const earned = evaluateEarnedBadges({ attempts: [], masteredKcCodes: allCodes, timeZone: TZ });
    expect(earned.has("topic1_mastered")).toBe(true);
    expect(earned.has("module1_mastered")).toBe(true);
    expect(earned.has("module2_mastered")).toBe(true);
    expect(earned.has("keystone_ready")).toBe(true);
  });

  it("does not earn module/platform badges when only some topics are mastered", () => {
    const partialCodes = getKcCodesForTopicTarget("module1_topic1");
    const earned = evaluateEarnedBadges({
      attempts: [],
      masteredKcCodes: partialCodes,
      timeZone: TZ,
    });
    expect(earned.has("topic1_mastered")).toBe(true);
    expect(earned.has("module1_mastered")).toBe(false);
    expect(earned.has("keystone_ready")).toBe(false);
  });

  it("earns the streak badge from consecutive recent active days", () => {
    const attempts: SessionCountAttemptRow[] = [
      { mode: "practice", assignmentId: null, answeredAt: isoDateDaysAgo(0) },
      { mode: "practice", assignmentId: null, answeredAt: isoDateDaysAgo(1) },
      { mode: "practice", assignmentId: null, answeredAt: isoDateDaysAgo(2) },
    ];
    const earned = evaluateEarnedBadges({ attempts, masteredKcCodes: new Set(), timeZone: TZ });
    expect(earned.has("streak_3")).toBe(true);
  });

  it("earns the comeback badge when there is a >=7 day gap in history", () => {
    const attempts: SessionCountAttemptRow[] = [
      { mode: "practice", assignmentId: null, answeredAt: "2026-01-01T10:00:00.000Z" },
      { mode: "practice", assignmentId: null, answeredAt: "2026-01-10T10:00:00.000Z" },
    ];
    const earned = evaluateEarnedBadges({ attempts, masteredKcCodes: new Set(), timeZone: TZ });
    expect(earned.has("comeback")).toBe(true);
  });
});
