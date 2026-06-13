import {
  getDefaultStandardForTopic,
  getStandardById,
  getStandardsForModule,
  type ModuleCode,
} from "@/lib/standards";

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

export type TrendDirection = "up" | "down" | "flat";

const MODULE_ORDER: ModuleCode[] = ["A", "B"];

const PRIOR_ATTEMPT_WEIGHT = 5;
const PRIOR_ACCURACY = 0.6;
const MIN_MEASURED_ATTEMPTS = 3;

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

/** Maps each attempt into the current module/category topic axis. */
export function resolveTopicKey(row: AttemptRow): string | null {
  const byStandard =
    typeof row.standard_id === "string" && row.standard_id.trim()
      ? getStandardById(row.standard_id)
      : undefined;
  if (byStandard) {
    return `Module ${byStandard.module} - ${byStandard.category}`;
  }

  const topic = typeof row.topic === "string" ? row.topic.trim() : "";
  if (!topic) return null;
  const fallback = getDefaultStandardForTopic(topic);
  return `Module ${fallback.module} - ${fallback.category}`;
}

function getSmoothedMastery(correct: number, total: number): number {
  const priorCorrect = PRIOR_ATTEMPT_WEIGHT * PRIOR_ACCURACY;
  const adjusted = (correct + priorCorrect) / (total + PRIOR_ATTEMPT_WEIGHT);
  return Math.round(adjusted * 100);
}

/**
 * Aggregates topic mastery using a Bayesian-style prior to avoid overly harsh
 * early scores while preserving long-run accuracy as attempts increase.
 */
export function calculateMastery(rows: AttemptRow[]): MasteryDatum[] {
  const totals = new Map<string, { correct: number; total: number }>();

  for (const row of rows) {
    const key = resolveTopicKey(row);
    if (!key) continue;

    const existing = totals.get(key) ?? { correct: 0, total: 0 };
    existing.total += 1;
    if (row.is_correct) existing.correct += 1;
    totals.set(key, existing);
  }

  return PROGRESS_TOPICS.map(({ key }) => {
    const stats = totals.get(key) ?? { correct: 0, total: 0 };

    if (stats.total === 0) {
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

    const mastery = getSmoothedMastery(stats.correct, stats.total);
    const level =
      stats.total < MIN_MEASURED_ATTEMPTS ? "estimated" : "measured";

    return {
      topic: key,
      fullTopic: key,
      mastery,
      masteryValue: mastery,
      attempts: stats.total,
      correct: stats.correct,
      level,
      fill: level === "estimated" ? "#65a30d" : "#2d6a4f",
    };
  });
}

function toDateKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(value);
}

/**
 * Compares mastery for each topic against mastery computed without the
 * most recent session's attempts, to surface whether a strand improved,
 * declined, or stayed flat since the student's last session.
 */
export function calculateTrends(
  rows: AttemptRow[],
  timeZone: string,
): Map<string, TrendDirection> {
  const trends = new Map<string, TrendDirection>();
  if (rows.length === 0) return trends;

  const dateKeys = rows.map((row) => toDateKey(new Date(row.answered_at), timeZone));
  const lastSessionKey = dateKeys.reduce((latest, key) => (key > latest ? key : latest));
  const previousRows = rows.filter((_, i) => dateKeys[i] !== lastSessionKey);

  const current = calculateMastery(rows);
  const previous = calculateMastery(previousRows);

  for (let i = 0; i < current.length; i += 1) {
    const cur = current[i];
    const prev = previous[i];
    if (cur.attempts === prev.attempts) {
      trends.set(cur.fullTopic, "flat");
    } else if (cur.masteryValue > prev.masteryValue) {
      trends.set(cur.fullTopic, "up");
    } else if (cur.masteryValue < prev.masteryValue) {
      trends.set(cur.fullTopic, "down");
    } else {
      trends.set(cur.fullTopic, "flat");
    }
  }
  return trends;
}
