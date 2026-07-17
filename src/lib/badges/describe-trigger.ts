import { getModuleCodeForTarget, getProgressTopicForTarget } from "@/lib/badges/catalog";
import { MODULE_TITLES } from "@/lib/standards";
import type { BadgeTrigger } from "@/types/badges";

const SESSION_MODE_LABEL: Record<string, string> = {
  self_practice: "self-practice",
  exam: "exam",
  review: "review",
};

/** Human-readable description of what a badge requires, for the badge preview UI. */
export function describeBadgeTrigger(trigger: BadgeTrigger): string {
  switch (trigger.type) {
    case "session_count":
      return `Complete ${trigger.count} ${SESSION_MODE_LABEL[trigger.mode]} session${
        trigger.count === 1 ? "" : "s"
      }.`;
    case "streak":
      return `Practice ${trigger.count} days in a row.`;
    case "return_after_gap":
      return `Come back after a break of ${trigger.gapDays}+ days.`;
    case "bkt_mastery": {
      if (trigger.scope === "platform") return "Master every module on the platform.";
      if (trigger.scope === "module") {
        const moduleCode = trigger.targetId ? getModuleCodeForTarget(trigger.targetId) : undefined;
        const label = moduleCode ? MODULE_TITLES[moduleCode] : "this module";
        return `Master every topic in ${label}.`;
      }
      const topic = trigger.targetId ? getProgressTopicForTarget(trigger.targetId) : undefined;
      return `Master all knowledge components in ${topic?.category ?? "this topic"}.`;
    }
  }
}
