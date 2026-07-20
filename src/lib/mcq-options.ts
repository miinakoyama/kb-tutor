import type { Question } from "@/types/question";
import { shuffleArray } from "@/lib/array-utils";

/** Display letter for a choice at the given 0-based position (0 → "A"). */
export function optionLabelAtIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Returns a copy of the question with MCQ options in a random order.
 * Option ids and correctOptionId are left unchanged so scoring/history stay stable.
 * Open-ended / single-option questions are returned as-is.
 */
export function shuffleQuestionOptions(question: Question): Question {
  if (question.questionType === "open-ended") {
    return question;
  }
  if (!question.options || question.options.length <= 1) {
    return question;
  }
  return {
    ...question,
    options: shuffleArray(question.options),
  };
}

/** Shuffle each question's MCQ options independently. */
export function withShuffledMcqOptions(questions: Question[]): Question[] {
  return questions.map(shuffleQuestionOptions);
}
