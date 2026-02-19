export type QuestionType = "mcq" | "open-ended";

export interface MCQOption {
  id: string;
  text: string;
}

export interface HintLevels {
  goal: string;
  principle: string;
  application: string;
  bottomOut: string;
}

export interface Question {
  id: string;
  module: number;
  topic: string;
  text: string;
  imageUrl: string | null;
  options: MCQOption[];
  correctOptionId: string;
  explanation: string;
  commonMisconception?: string;
  hints: HintLevels;
  questionType?: QuestionType;
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
