import type {
  GradingConfidence,
  ShortAnswerItem,
  ShortAnswerPart,
} from "@/types/short-answer";

/** Raw scoring output from a grading method, before UI feedback composition. */
export interface MethodGradeOutput {
  score: number;
  /** Single student-facing feedback string (composed into segments later). */
  feedback: string;
  diagnosedGap?: string;
  confidence?: GradingConfidence;
  tokenCount: number;
  latencyMs: number;
}

export interface MethodGradeInput {
  item: ShortAnswerItem;
  part: ShortAnswerPart;
  studentResponse: string;
  modelId: string;
  temperature: number;
  /** True when no retry will remain after this submission. */
  isFinalSubmission?: boolean;
  /** Diagnosed gaps from earlier parts of the same item (Method 1 context). */
  priorGaps?: Record<string, string>;
}
