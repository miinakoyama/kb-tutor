export type QuestionCoverageState = "valid" | "unresolved" | "invalid" | "excluded";

export interface CoverageQuestion {
  standardId: string;
  format: "mcq" | "saq";
  includeInSelfPractice: boolean;
  expectedSlots: number;
  confirmedSlots: number;
  hasInvalidMapping: boolean;
  confirmedKcCodes: string[];
}

export interface StandardCoverageSummary {
  standardId: string;
  questionCount: number;
  selfPracticeCount: number;
  validCount: number;
  unresolvedCount: number;
  invalidCount: number;
  excludedCount: number;
  coveredKcCount: number;
  activeKcCount: number;
  canActivate: boolean;
}

export function coverageState(question: CoverageQuestion): QuestionCoverageState {
  if (!question.includeInSelfPractice) return "excluded";
  if (question.hasInvalidMapping || question.confirmedSlots > question.expectedSlots) {
    return "invalid";
  }
  if (question.expectedSlots > 0 && question.confirmedSlots === question.expectedSlots) {
    return "valid";
  }
  return "unresolved";
}

export function summarizeStandardCoverage(
  standardId: string,
  questions: readonly CoverageQuestion[],
  activeKcCodes: readonly string[],
): StandardCoverageSummary {
  const relevant = questions.filter((question) => question.standardId === standardId);
  const states = relevant.map(coverageState);
  const covered = new Set(
    relevant
      .filter((question) => coverageState(question) === "valid")
      .flatMap((question) => question.confirmedKcCodes),
  );
  const validCount = states.filter((state) => state === "valid").length;
  const unresolvedCount = states.filter((state) => state === "unresolved").length;
  const invalidCount = states.filter((state) => state === "invalid").length;
  const excludedCount = states.filter((state) => state === "excluded").length;
  const coveredKcCount = activeKcCodes.filter((code) => covered.has(code)).length;
  return {
    standardId,
    questionCount: relevant.length,
    selfPracticeCount: relevant.filter((question) => question.includeInSelfPractice).length,
    validCount,
    unresolvedCount,
    invalidCount,
    excludedCount,
    coveredKcCount,
    activeKcCount: activeKcCodes.length,
    canActivate:
      unresolvedCount === 0 &&
      invalidCount === 0 &&
      activeKcCodes.length > 0 &&
      coveredKcCount === activeKcCodes.length,
  };
}
