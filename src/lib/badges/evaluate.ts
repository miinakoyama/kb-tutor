import { BADGE_CATALOG } from "@/lib/badges/catalog";
import { isModuleMastered, isPlatformMastered, isTopicMastered } from "@/lib/badges/mastery-scope";
import { countSessionsByMode, type SessionCountAttemptRow } from "@/lib/badges/session-counts";
import {
  calculateStreak,
  getDistinctActiveDateKeys,
  hasComebackGap,
  toAttemptRow,
} from "@/lib/badges/streak";

export interface EvaluateBadgesInput {
  attempts: SessionCountAttemptRow[];
  masteredKcCodes: ReadonlySet<string>;
  timeZone: string;
}

/** Returns the ids of every badge currently satisfied by the given data. */
export function evaluateEarnedBadges({
  attempts,
  masteredKcCodes,
  timeZone,
}: EvaluateBadgesInput): Set<string> {
  const sessionCounts = countSessionsByMode(attempts, timeZone);
  const answeredAtValues = attempts.map((row) => row.answeredAt);
  const currentStreak = calculateStreak(answeredAtValues.map(toAttemptRow), timeZone);
  const activeDateKeys = getDistinctActiveDateKeys(answeredAtValues, timeZone);

  const earned = new Set<string>();
  for (const badge of BADGE_CATALOG) {
    const { trigger } = badge;
    let satisfied = false;

    switch (trigger.type) {
      case "session_count":
        satisfied = sessionCounts[trigger.mode] >= trigger.count;
        break;
      case "bkt_mastery":
        if (trigger.scope === "topic" && trigger.targetId) {
          satisfied = isTopicMastered(masteredKcCodes, trigger.targetId);
        } else if (trigger.scope === "module" && trigger.targetId) {
          satisfied = isModuleMastered(masteredKcCodes, trigger.targetId);
        } else if (trigger.scope === "platform") {
          satisfied = isPlatformMastered(masteredKcCodes);
        }
        break;
      case "streak":
        satisfied = currentStreak >= trigger.count;
        break;
      case "return_after_gap":
        satisfied = hasComebackGap(activeDateKeys, trigger.gapDays);
        break;
    }

    if (satisfied) earned.add(badge.id);
  }

  return earned;
}
