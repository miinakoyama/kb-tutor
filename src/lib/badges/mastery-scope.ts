import { getStandardsForModule } from "@/lib/standards";
import { getKCsByStandard } from "@/lib/short-answer/generation/data";
import {
  MODULE_TARGET_IDS,
  getProgressTopicForTarget,
  getTopicTargetIdsForModuleTarget,
} from "@/lib/badges/catalog";

/** All KC codes that belong to a topic (module + category), from the static curriculum catalog. */
export function getKcCodesForTopicTarget(topicTargetId: string): Set<string> {
  const topic = getProgressTopicForTarget(topicTargetId);
  if (!topic) return new Set();

  const codes = new Set<string>();
  const standards = getStandardsForModule(topic.module).filter(
    (standard) => standard.category === topic.category,
  );
  for (const standard of standards) {
    for (const kc of getKCsByStandard(standard.id)) {
      codes.add(kc.code);
    }
  }
  return codes;
}

/** A topic is mastered when every KC it contains has `mastered = true`, and it has at least one KC. */
export function isTopicMastered(
  masteredKcCodes: ReadonlySet<string>,
  topicTargetId: string,
): boolean {
  const topicKcCodes = getKcCodesForTopicTarget(topicTargetId);
  if (topicKcCodes.size === 0) return false;
  for (const code of topicKcCodes) {
    if (!masteredKcCodes.has(code)) return false;
  }
  return true;
}

/** A module is mastered when every topic within it is mastered. */
export function isModuleMastered(
  masteredKcCodes: ReadonlySet<string>,
  moduleTargetId: string,
): boolean {
  const topicTargetIds = getTopicTargetIdsForModuleTarget(moduleTargetId);
  if (topicTargetIds.length === 0) return false;
  return topicTargetIds.every((topicTargetId) => isTopicMastered(masteredKcCodes, topicTargetId));
}

/** The platform is mastered when every module is mastered. */
export function isPlatformMastered(masteredKcCodes: ReadonlySet<string>): boolean {
  return MODULE_TARGET_IDS.every((moduleTargetId) => isModuleMastered(masteredKcCodes, moduleTargetId));
}
