import { getStandardById, getStandardsForModule, type ModuleCode } from "@/lib/standards";

export type AttemptRow = {
  is_correct: boolean;
  answered_at: string;
  topic: string | null;
  standard_id: string | null;
};

export type MasteryLevel = "insufficient_data" | "estimated" | "measured";

export type ProgressTopic = {
  key: string;
  module: ModuleCode;
  category: string;
};

export type MasteryDatum = {
  topic: string;
  fullTopic: string;
  mastery: number;
  masteryValue: number;
  attempts: number;
  correct: number;
  level: MasteryLevel;
  fill: string;
};

const MODULE_ORDER: ModuleCode[] = ["A", "B"];

/** Matches the unobserved-KC fallback probability in `api/practice/next`. */
const DEFAULT_UNOBSERVED_PROBABILITY = 0.3;

export type ActiveKc = {
  code: string;
  standardId: string;
};

export const PROGRESS_TOPICS: ProgressTopic[] = MODULE_ORDER.flatMap((module) => {
  const categories = Array.from(
    new Set(getStandardsForModule(module).map((standard) => standard.category)),
  );
  return categories.map((category) => ({
    key: `Module ${module} - ${category}`,
    module,
    category,
  }));
});

/**
 * Aggregates topic mastery straight from each KC's BKT probability, averaged
 * per topic. Unobserved KCs contribute their fallback probability rather
 * than being excluded — under BKT that fallback already represents the
 * model's estimate of an untested KC, so leaving it in keeps a topic with
 * many untouched KCs from reading as "mastered" once only one has been seen.
 */
export function calculateKcMastery(
  activeKcs: readonly ActiveKc[],
  probabilityByKcCode: ReadonlyMap<string, number>,
): MasteryDatum[] {
  const totals = new Map<string, { probabilitySum: number; kcCount: number }>();

  for (const kc of activeKcs) {
    const standard = getStandardById(kc.standardId);
    if (!standard) continue;
    const key = `Module ${standard.module} - ${standard.category}`;

    const probability = probabilityByKcCode.get(kc.code) ?? DEFAULT_UNOBSERVED_PROBABILITY;
    const existing = totals.get(key) ?? { probabilitySum: 0, kcCount: 0 };
    existing.probabilitySum += probability;
    existing.kcCount += 1;
    totals.set(key, existing);
  }

  return PROGRESS_TOPICS.map(({ key }) => {
    const stats = totals.get(key);

    if (!stats || stats.kcCount === 0) {
      return {
        topic: key,
        fullTopic: key,
        mastery: 0,
        masteryValue: 0,
        attempts: 0,
        correct: 0,
        level: "insufficient_data",
        fill: "#94a3b8",
      };
    }

    const mastery = Math.round((stats.probabilitySum / stats.kcCount) * 100);

    return {
      topic: key,
      fullTopic: key,
      mastery,
      masteryValue: mastery,
      attempts: stats.kcCount,
      correct: 0,
      level: "measured",
      fill: "#2d6a4f",
    };
  });
}
