import { PROGRESS_TOPICS, type ProgressTopic } from "@/lib/progress/mastery";
import type { ModuleCode } from "@/lib/standards";
import type { BadgeDefinition } from "@/types/badges";

/**
 * Maps the badge spec's `module1_topic1..module2_topic3` target ids onto the
 * existing PROGRESS_TOPICS axis. PROGRESS_TOPICS is built as
 * `MODULE_ORDER.flatMap(module => categories)` with MODULE_ORDER = ["A", "B"],
 * so it is already ordered [Module A's 3 categories, Module B's 3 categories]
 * in curriculum order — a 1:1 positional match for the spec's topic ids.
 */
const TOPIC_TARGET_IDS = [
  "module1_topic1",
  "module1_topic2",
  "module1_topic3",
  "module2_topic1",
  "module2_topic2",
  "module2_topic3",
] as const;

const MODULE_TARGET_TO_CODE: Record<string, ModuleCode> = {
  module1: "A",
  module2: "B",
};

export const MODULE_TARGET_IDS = Object.keys(MODULE_TARGET_TO_CODE);

export function getProgressTopicForTarget(targetId: string): ProgressTopic | undefined {
  const index = TOPIC_TARGET_IDS.indexOf(targetId as (typeof TOPIC_TARGET_IDS)[number]);
  if (index === -1) return undefined;
  return PROGRESS_TOPICS[index];
}

export function getModuleCodeForTarget(targetId: string): ModuleCode | undefined {
  return MODULE_TARGET_TO_CODE[targetId];
}

export function getTopicTargetIdsForModuleTarget(moduleTargetId: string): string[] {
  if (!MODULE_TARGET_IDS.includes(moduleTargetId)) return [];
  return TOPIC_TARGET_IDS.filter((id) => id.startsWith(moduleTargetId));
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    id: "first_practice",
    name: "First Practice",
    category: "getting_started",
    trigger: { type: "session_count", mode: "self_practice", count: 1 },
    icon: "badge_first-practice.png",
  },
  {
    id: "first_exam",
    name: "First Exam",
    category: "getting_started",
    trigger: { type: "session_count", mode: "exam", count: 1 },
    icon: "badge_first-exam.png",
  },
  {
    id: "first_review",
    name: "First Review",
    category: "getting_started",
    trigger: { type: "session_count", mode: "review", count: 1 },
    icon: "badge_first-review.png",
  },
  {
    id: "practice_5",
    name: "Getting Warmed Up",
    category: "practice_volume",
    trigger: { type: "session_count", mode: "self_practice", count: 5 },
    icon: "badge_practice-5.png",
  },
  {
    id: "practice_15",
    name: "In the Groove",
    category: "practice_volume",
    trigger: { type: "session_count", mode: "self_practice", count: 15 },
    icon: "badge_practice-15.png",
  },
  {
    id: "practice_30",
    name: "Practice Pro",
    category: "practice_volume",
    trigger: { type: "session_count", mode: "self_practice", count: 30 },
    icon: "badge_practice-30.png",
  },
  {
    id: "exam_5",
    name: "Exam Starter",
    category: "exam_volume",
    trigger: { type: "session_count", mode: "exam", count: 5 },
    icon: "badge_exam-5.png",
  },
  {
    id: "exam_15",
    name: "Exam Regular",
    category: "exam_volume",
    trigger: { type: "session_count", mode: "exam", count: 15 },
    icon: "badge_exam-15.png",
  },
  {
    id: "exam_30",
    name: "Exam Veteran",
    category: "exam_volume",
    trigger: { type: "session_count", mode: "exam", count: 30 },
    icon: "badge_exam-30.png",
  },
  {
    id: "review_5",
    name: "Review Starter",
    category: "review_volume",
    trigger: { type: "session_count", mode: "review", count: 5 },
    icon: "badge_review-5.png",
  },
  {
    id: "review_15",
    name: "Review Regular",
    category: "review_volume",
    trigger: { type: "session_count", mode: "review", count: 15 },
    icon: "badge_review-15.png",
  },
  {
    id: "review_30",
    name: "Review Veteran",
    category: "review_volume",
    trigger: { type: "session_count", mode: "review", count: 30 },
    icon: "badge_review-30.png",
  },
  {
    id: "topic1_mastered",
    name: "Topic 1 Mastered",
    category: "mastery_topic",
    trigger: {
      type: "bkt_mastery",
      scope: "topic",
      targetId: "module1_topic1",
      condition: "all_kcs_above_threshold",
    },
    icon: "badge_topic1-mastered.png",
  },
  {
    id: "topic2_mastered",
    name: "Topic 2 Mastered",
    category: "mastery_topic",
    trigger: {
      type: "bkt_mastery",
      scope: "topic",
      targetId: "module1_topic2",
      condition: "all_kcs_above_threshold",
    },
    icon: "badge_topic2-mastered.png",
  },
  {
    id: "topic3_mastered",
    name: "Topic 3 Mastered",
    category: "mastery_topic",
    trigger: {
      type: "bkt_mastery",
      scope: "topic",
      targetId: "module1_topic3",
      condition: "all_kcs_above_threshold",
    },
    icon: "badge_topic3-mastered.png",
  },
  {
    id: "topic4_mastered",
    name: "Topic 4 Mastered",
    category: "mastery_topic",
    trigger: {
      type: "bkt_mastery",
      scope: "topic",
      targetId: "module2_topic1",
      condition: "all_kcs_above_threshold",
    },
    icon: "badge_topic4-mastered.png",
  },
  {
    id: "topic5_mastered",
    name: "Topic 5 Mastered",
    category: "mastery_topic",
    trigger: {
      type: "bkt_mastery",
      scope: "topic",
      targetId: "module2_topic2",
      condition: "all_kcs_above_threshold",
    },
    icon: "badge_topic5-mastered.png",
  },
  {
    id: "topic6_mastered",
    name: "Topic 6 Mastered",
    category: "mastery_topic",
    trigger: {
      type: "bkt_mastery",
      scope: "topic",
      targetId: "module2_topic3",
      condition: "all_kcs_above_threshold",
    },
    icon: "badge_topic6-mastered.png",
  },
  {
    id: "module1_mastered",
    name: "Module 1 Mastered",
    category: "mastery_module",
    trigger: {
      type: "bkt_mastery",
      scope: "module",
      targetId: "module1",
      condition: "all_topics_mastered",
    },
    icon: "badge_module1-mastered.png",
  },
  {
    id: "module2_mastered",
    name: "Module 2 Mastered",
    category: "mastery_module",
    trigger: {
      type: "bkt_mastery",
      scope: "module",
      targetId: "module2",
      condition: "all_topics_mastered",
    },
    icon: "badge_module2-mastered.png",
  },
  {
    id: "keystone_ready",
    name: "Keystone Ready",
    category: "mastery_platform",
    trigger: { type: "bkt_mastery", scope: "platform", condition: "all_modules_mastered" },
    icon: "badge_keystone-ready.png",
  },
  {
    id: "streak_3",
    name: "3-Day Streak",
    category: "consistency",
    trigger: { type: "streak", unit: "day", count: 3 },
    icon: "badge_streak-3.png",
  },
  {
    id: "comeback",
    name: "Comeback",
    category: "consistency",
    trigger: { type: "return_after_gap", gapDays: 7 },
    icon: "badge_comeback.png",
  },
];
