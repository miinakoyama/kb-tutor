import type { AttemptMode } from "@/lib/analytics/teacher-dashboard-server";

export type SourceFilter = "assigned" | "self" | "all";
export type RangeKey = "7d" | "30d" | "all";
export type ScopeMode = "selected" | "all";
export type AccuracyBucket = "low" | "mid" | "high";
export type SampleMode = "random" | "high_accuracy_first" | "low_accuracy_first";

export interface QuestionPreviewOption {
  id: string;
  text: string;
}

export interface QuestionPreview {
  text: string;
  imageUrl: string | null;
  options: QuestionPreviewOption[];
  correctOptionId: string;
  diagram: { type: string; data: unknown } | null;
}

export interface OptionDistribution {
  optionId: string;
  text: string;
  isCorrect: boolean;
  picks: number;
  share: number;
}

export interface PerModeMetrics {
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
}

export interface QuestionInStandardRow {
  questionId: string;
  preview: QuestionPreview | null;
  attempted: number;
  uniqueStudents: number;
  correct: number;
  accuracy: number;
  bucket: AccuracyBucket;
  averageTimeSec: number;
  byMode: Record<AttemptMode, PerModeMetrics>;
  optionDistribution: OptionDistribution[];
}

export interface StandardDrillDownPayload {
  standardId: string;
  standardLabel: string;
  summary: {
    totalAttempts: number;
    totalCorrect: number;
    accuracy: number;
    uniqueStudents: number;
    questionsAttempted: number;
  };
  questions: QuestionInStandardRow[];
}

export type StudentStatus = "on_track" | "watch" | "struggling" | "not_started";

export interface ChartPoint {
  attemptIndex: number;
  answeredAt: string;
  rollingAccuracy: number;
  cumulativeAccuracy: number;
  isSmallSample: boolean;
}

export interface StudentAttemptRow {
  attemptId: string;
  questionId: string;
  questionStem: string;
  selectedOptionId: string;
  selectedOptionText: string;
  isCorrect: boolean;
  correctOptionId: string;
  timeSpentSec: number | null;
  mode: AttemptMode;
  assignmentId: string | null;
  assignmentLabel: string;
  standardId: string | null;
  standardLabel: string | null;
  answeredAt: string;
}

export interface StudentProfilePayload {
  student: {
    id: string;
    label: string;
    classId: string | null;
    classLabel: string;
  };
  summary: {
    totalAttempts: number;
    totalCorrect: number;
    accuracy: number;
    averageTimeSec: number;
    status: StudentStatus;
  };
  filters: {
    assignments: { id: string; label: string }[];
    standards: { id: string; label: string }[];
  };
  chart: ChartPoint[];
  answers: {
    rows: StudentAttemptRow[];
    nextCursor: string | null;
  };
}

export interface QuestionDetailPayload {
  questionId: string;
  preview: QuestionPreview | null;
  standardId: string | null;
  standardLabel: string | null;
  scope: ScopeMode;
  summary: {
    totalAttempts: number;
    uniqueStudents: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
    timeP50Sec: number | null;
    timeP90Sec: number | null;
  };
  byMode: Record<AttemptMode, PerModeMetrics>;
  optionDistribution: OptionDistribution[];
  studentContext?: {
    studentId: string;
    label: string;
    selectedOptionId: string;
    isCorrect: boolean;
    answeredAt: string;
    mode: AttemptMode;
  };
}

export interface SampleQuestionPayload {
  questionId: string | null;
  preview: QuestionPreview | null;
  standardId: string;
  standardLabel: string;
  position: number;
  totalAvailable: number;
  isLast: boolean;
  mode: SampleMode;
  seed: string;
}

export const ROLLING_WINDOW_ATTEMPTS = 20;
export const SMALL_SAMPLE_THRESHOLD = 10;
export const STUDENT_ANSWER_PAGE_SIZE = 50;

export const ATTEMPT_MODES_TUPLE = ["practice", "exam", "review"] as const;

export function emptyPerMode(): Record<AttemptMode, PerModeMetrics> {
  return {
    practice: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
    exam: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
    review: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
  };
}
