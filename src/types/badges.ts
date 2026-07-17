export type BadgeCategory =
  | "getting_started"
  | "practice_volume"
  | "exam_volume"
  | "review_volume"
  | "mastery_topic"
  | "mastery_module"
  | "mastery_platform"
  | "consistency";

export type SessionCountMode = "self_practice" | "exam" | "review";

export interface SessionCountTrigger {
  type: "session_count";
  mode: SessionCountMode;
  count: number;
}

export type MasteryScope = "topic" | "module" | "platform";

export interface BktMasteryTrigger {
  type: "bkt_mastery";
  scope: MasteryScope;
  /** Present for topic/module scope; absent for platform scope. */
  targetId?: string;
  condition: "all_kcs_above_threshold" | "all_topics_mastered" | "all_modules_mastered";
}

export interface StreakTrigger {
  type: "streak";
  unit: "day";
  count: number;
}

export interface ReturnAfterGapTrigger {
  type: "return_after_gap";
  gapDays: number;
}

export type BadgeTrigger =
  | SessionCountTrigger
  | BktMasteryTrigger
  | StreakTrigger
  | ReturnAfterGapTrigger;

export interface BadgeDefinition {
  id: string;
  name: string;
  category: BadgeCategory;
  trigger: BadgeTrigger;
  icon: string;
}

export interface StudentBadgeView {
  id: string;
  name: string;
  category: BadgeCategory;
  icon: string;
  earned: boolean;
  earnedAt: string | null;
}

/** Slim projection of a badge, as returned by the session-end celebration sync. */
export interface EarnedBadgeSummary {
  id: string;
  name: string;
  icon: string;
}
