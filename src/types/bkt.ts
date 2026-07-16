import type { PartLabel } from "@/types/short-answer";

export type QuestionFormat = "mcq" | "saq";
export type CoverageState = "confirmed" | "unresolved" | "invalid" | "stale";
export type MappingProvenance = "content" | "model" | "admin";
export type ClassificationStatus =
  | "preview"
  | "ready"
  | "published"
  | "rolled_back"
  | "failed";
export type ClassificationOutcome =
  | "agreed"
  | "disagreed"
  | "ambiguous"
  | "invalid"
  | "error";
export type SelectionLane = "first_pass" | "priority" | "rotation";
export type AdaptiveStopReason = "complete" | "coverage_gap" | "scope_unavailable";

export interface KnowledgeComponent {
  code: string;
  standardId: string;
  shortCode: string;
  statement: string;
  vocabulary: string[];
  catalogOrder: number;
  active: boolean;
}

export interface BktParameters {
  id: string;
  version: string;
  format: QuestionFormat;
  initialMastery: number;
  learningRate: number;
  guessRate: number;
  slipRate: number;
  forgettingRate: 0;
  masteryThreshold: number;
  active: boolean;
}

export interface QuestionKcAssignment {
  id: string;
  questionId: string;
  questionSetId: string;
  partLabel: PartLabel | null;
  format: QuestionFormat;
  standardId: string;
  kcCode: string;
  state: CoverageState;
  provenance: MappingProvenance;
  sourceContentHash: string;
  validFrom: string;
  validTo: string | null;
}

export interface StudentKcMastery {
  studentId: string;
  kcCode: string;
  probability: number;
  mastered: boolean;
  parameterSetId: string;
  latestEventId: string | null;
  latestAnsweredAt: string | null;
  version: number;
}

export interface MasteryEvent {
  id: string;
  studentId: string;
  kcCode: string;
  assignmentId: string;
  parameterSetId: string;
  sourceTable: "attempts" | "short_answer_attempts";
  sourceAttemptId: string;
  questionId: string;
  partLabel: PartLabel | null;
  format: QuestionFormat;
  mode: "practice" | "exam" | "review";
  correct: boolean;
  priorProbability: number;
  posteriorProbability: number;
  resultingProbability: number;
  answeredAt: string;
  supersededAt: string | null;
}

export interface ClassificationDecision {
  provider: "openai" | "gemini";
  modelId: string;
  promptVersion: string;
  kcCode: string | null;
  rationale: string;
  ambiguous: boolean;
  valid: boolean;
  inputTokens: number;
  outputTokens: number;
}

export interface AdaptiveKcCandidate {
  kcCode: string;
  standardId: string;
  catalogOrder: number;
  probability: number;
  mastered: boolean;
  observed: boolean;
  lastServedAt: string | null;
}

export interface AdaptiveQuestionCandidate {
  questionId: string;
  questionSetId: string;
  format: QuestionFormat;
  standardId: string;
  targetKcCode: string;
  partKcCodes: string[];
  completedCount: number;
  lastCompletedAt: string | null;
}

export interface AdaptiveSelectionDecision {
  lane: SelectionLane;
  standardId: string;
  targetKcCode: string;
  questionId: string;
  questionSetId: string;
  candidateKcCodes: string[];
  fallbackKcCodes: string[];
  rotationVersion: number;
}
