import type { AdaptiveKcCandidate, AdaptiveQuestionCandidate, SelectionLane } from "@/types/bkt";

export interface TargetSelectionInput {
  candidates: AdaptiveKcCandidate[];
  standardOrder: string[];
  cyclePositionByStandard: ReadonlyMap<string, number>;
  standardLastServedAt: ReadonlyMap<string, string | null>;
  recentKcCodesByStandard: ReadonlyMap<string, readonly string[]>;
}

export interface TargetSelectionResult {
  lane: SelectionLane;
  standardId: string;
  orderedKcCodes: string[];
}

function time(value: string | null): number {
  return value ? Date.parse(value) || 0 : 0;
}

function compareRecencyThenOrder(a: AdaptiveKcCandidate, b: AdaptiveKcCandidate): number {
  return time(a.lastServedAt) - time(b.lastServedAt) || a.catalogOrder - b.catalogOrder || a.kcCode.localeCompare(b.kcCode);
}

export function orderTargetKcs(input: TargetSelectionInput): TargetSelectionResult | null {
  const unmastered = input.candidates.filter((candidate) => !candidate.mastered && candidate.probability < 0.95);
  if (!unmastered.length) return null;
  const unseen = unmastered.filter((candidate) => !candidate.observed);
  if (unseen.length) {
    const standardRank = new Map(input.standardOrder.map((standard, index) => [standard, index]));
    const ordered = unseen.sort(
      (a, b) =>
        (standardRank.get(a.standardId) ?? Number.MAX_SAFE_INTEGER) -
          (standardRank.get(b.standardId) ?? Number.MAX_SAFE_INTEGER) ||
        a.catalogOrder - b.catalogOrder ||
        a.kcCode.localeCompare(b.kcCode),
    );
    return { lane: "first_pass", standardId: ordered[0].standardId, orderedKcCodes: ordered.filter((item) => item.standardId === ordered[0].standardId).map((item) => item.kcCode) };
  }

  const standards = [...new Set(unmastered.map((candidate) => candidate.standardId))].sort(
    (a, b) =>
      time(input.standardLastServedAt.get(a) ?? null) - time(input.standardLastServedAt.get(b) ?? null) ||
      input.standardOrder.indexOf(a) - input.standardOrder.indexOf(b),
  );
  const standardId = standards[0];
  const lane: SelectionLane = (input.cyclePositionByStandard.get(standardId) ?? 0) % 3 === 2 ? "rotation" : "priority";
  const eligible = unmastered.filter((candidate) => candidate.standardId === standardId);
  eligible.sort(
    lane === "priority"
      ? (a, b) => b.probability - a.probability || compareRecencyThenOrder(a, b)
      : compareRecencyThenOrder,
  );
  const recentKcCodes = input.recentKcCodesByStandard.get(standardId) ?? [];
  if (eligible.length > 1 && recentKcCodes.length >= 2) {
    const lastTwo = recentKcCodes.slice(-2);
    if (lastTwo[0] === eligible[0].kcCode && lastTwo[1] === eligible[0].kcCode) {
      const alternative = eligible.findIndex((candidate) => candidate.kcCode !== eligible[0].kcCode);
      if (alternative > 0) [eligible[0], eligible[alternative]] = [eligible[alternative], eligible[0]];
    }
  }
  return { lane, standardId, orderedKcCodes: eligible.map((candidate) => candidate.kcCode) };
}

export function rankQuestionsForKc(
  candidates: readonly AdaptiveQuestionCandidate[],
  targetKcCode: string,
  lastQuestion: { questionSetId: string | null; questionId: string } | null,
  sessionSeed: string,
  /**
   * Question-type filter chosen by the student ("mcq" / "saq" / mixed-pattern
   * slot). When the required format has no eligible candidates for this KC,
   * an "saq" requirement falls back to MCQ; an "mcq" requirement returns no
   * candidates so the caller can try the next KC instead.
   */
  requiredFormat?: "mcq" | "saq",
): AdaptiveQuestionCandidate[] {
  let eligible = candidates.filter(
    (candidate) =>
      candidate.targetKcCode === targetKcCode ||
      (candidate.format === "saq" && candidate.partKcCodes.includes(targetKcCode)),
  );
  if (requiredFormat) {
    const constrained = eligible.filter((candidate) => candidate.format === requiredFormat);
    eligible = constrained.length > 0
      ? constrained
      : requiredFormat === "saq"
        ? eligible.filter((candidate) => candidate.format === "mcq")
        : [];
  }
  const isImmediate = (candidate: AdaptiveQuestionCandidate) =>
    candidate.questionId === lastQuestion?.questionId &&
    (!lastQuestion.questionSetId ||
      candidate.questionSetId === lastQuestion.questionSetId);
  if (eligible.length > 1) {
    eligible = eligible.filter((candidate) => !isImmediate(candidate));
  }

  const stableHash = (candidate: AdaptiveQuestionCandidate): number => {
    const value = `${sessionSeed}\0${candidate.questionSetId}\0${candidate.questionId}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  return [...eligible].sort((a, b) => {
    return a.completedCount - b.completedCount ||
      time(a.lastCompletedAt) - time(b.lastCompletedAt) ||
      stableHash(a) - stableHash(b) ||
      a.questionSetId.localeCompare(b.questionSetId) ||
      a.questionId.localeCompare(b.questionId);
  });
}
