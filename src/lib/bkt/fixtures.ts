import type { QuestionFormat } from "@/types/bkt";

export interface BktFixtureStep {
  correct: boolean;
  expectedPosterior: number;
  expectedResult: number;
}

export interface BktFixture {
  name: string;
  format: QuestionFormat;
  initialMastery: number;
  steps: BktFixtureStep[];
}

export const MCQ_PARAMETERS = {
  initialMastery: 0.3,
  learningRate: 0.1,
  guessRate: 0.25,
  slipRate: 0.1,
  forgettingRate: 0 as const,
  masteryThreshold: 0.95,
};

export const SAQ_PARAMETERS = {
  initialMastery: 0.3,
  learningRate: 0.1,
  guessRate: 0.1,
  slipRate: 0.1,
  forgettingRate: 0 as const,
  masteryThreshold: 0.95,
};

export const BKT_GOLDEN_FIXTURES: BktFixture[] = [
  {
    name: "MCQ correct from aggregate prior",
    format: "mcq",
    initialMastery: 0.3,
    steps: [
      {
        correct: true,
        expectedPosterior: 0.6067415730337079,
        expectedResult: 0.6460674157303371,
      },
    ],
  },
  {
    name: "MCQ incorrect from aggregate prior",
    format: "mcq",
    initialMastery: 0.3,
    steps: [
      {
        correct: false,
        expectedPosterior: 0.05405405405405405,
        expectedResult: 0.14864864864864866,
      },
    ],
  },
  {
    name: "SAQ correct from aggregate prior",
    format: "saq",
    initialMastery: 0.3,
    steps: [
      {
        correct: true,
        expectedPosterior: 0.7941176470588235,
        expectedResult: 0.8147058823529412,
      },
    ],
  },
  {
    name: "SAQ incorrect from aggregate prior",
    format: "saq",
    initialMastery: 0.3,
    steps: [
      {
        correct: false,
        expectedPosterior: 0.045454545454545456,
        expectedResult: 0.14090909090909093,
      },
    ],
  },
];
