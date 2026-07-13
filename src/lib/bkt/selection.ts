import type { AdaptiveKcCandidate, AdaptiveQuestionCandidate, SelectionLane } from "@/types/bkt";

export interface TargetSelectionInput {
  candidates: AdaptiveKcCandidate[];
  standardOrder: string[];
  cyclePositionByStandard: ReadonlyMap<string, number>;
  standardLastServedAt: ReadonlyMap<string, string | null>;
  recentKcCodes: string[];
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
  if (eligible.length > 1 && input.recentKcCodes.length >= 2) {
    const lastTwo = input.recentKcCodes.slice(-2);
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
  unmasteredKcCodes: ReadonlySet<string>,
  lastQuestionId: string | null,
): AdaptiveQuestionCandidate[] {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.targetKcCode === targetKcCode ||
      (candidate.format === "saq" && candidate.partKcCodes.includes(targetKcCode)),
  );
  return [...eligible].sort((a, b) => {
    if (a.answered !== b.answered) return a.answered ? 1 : -1;
    const aImmediate = a.questionId === lastQuestionId;
    const bImmediate = b.questionId === lastQuestionId;
    if (aImmediate !== bImmediate) return aImmediate ? 1 : -1;
    if (a.format === "saq" && b.format === "saq") {
      const additional = (candidate: AdaptiveQuestionCandidate) =>
        new Set(candidate.partKcCodes.filter((code) => code !== targetKcCode && unmasteredKcCodes.has(code))).size;
      const coverageDifference = additional(b) - additional(a);
      if (coverageDifference) return coverageDifference;
    }
    return time(a.lastAnsweredAt) - time(b.lastAnsweredAt) || a.questionId.localeCompare(b.questionId);
  });
}
