export type QuestionType = "mcq" | "open-ended";

export type PracticeMode = "guided" | "practice" | "exam" | "review";

export interface MCQOption {
  id: string;
  text: string;
  feedback?: string;
}

export interface HintLevels {
  goal: string;
  principle: string;
  application: string;
  bottomOut: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  example?: string;
  imageUrl?: string | null;
  relatedConcepts?: string[];
}

export interface RationaleQuestion {
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
}

export interface Question {
  id: string;
  module: number;
  topic: string;
  text: string;
  imageUrl: string | null;
  options: MCQOption[];
  correctOptionId: string;
  explanation?: string;
  commonMisconception?: string;
  hints?: HintLevels;
  questionType?: QuestionType;

  inlineTermIds?: string[];
  sidebarTermIds?: string[];
  focusHint?: string;
  keyKnowledge?: string;

  rationaleQuestion?: RationaleQuestion;

  misconceptionId?: string;
  relatedQuestionIds?: string[];
}

export type ConfidenceLevel = "not_sure" | "somewhat" | "sure";

export interface AnswerRecord {
  selectedOptionId: string;
  isCorrect: boolean;
  confidenceLevel?: ConfidenceLevel;
  rationaleAnswer?: { selectedOptionId: string; isCorrect: boolean };
  flagged?: boolean;
  reviewLater?: boolean;
  timeSpentMs?: number;
}

export interface SessionConfig {
  mode: PracticeMode;
  moduleId?: number;
  topicName?: string;
  questionCount?: number;
  showTimer?: boolean;
}

export const MODULES = [
  {
    id: 1,
    topics: [
      "Basic Biological Principles",
      "Chemical Basis for Life",
      "Bioenergetics",
      "Homeostasis and Transport",
    ],
  },
  {
    id: 2,
    topics: [
      "Cell Growth and Reproduction",
      "Genetics",
      "Theory of Evolution",
      "Ecology",
    ],
  },
] as const;
