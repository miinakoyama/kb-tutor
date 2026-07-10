import type { Question } from "@/types/question";
import { validateShortAnswerItem } from "@/lib/short-answer/item-schema";

/** True when the question is an open-ended (short-answer) item. */
export function isShortAnswerQuestion(question: Question): boolean {
  return question.questionType === "open-ended";
}

/**
 * Load-time guard (research R8): keep MCQs as-is; keep open-ended questions
 * only when their `shortAnswer` payload passes structural validation, so a
 * corrupt payload can never crash the practice UI.
 */
export function filterRenderableQuestions(questions: Question[]): Question[] {
  return questions.filter((question) => {
    if (!isShortAnswerQuestion(question)) return true;
    if (!question.shortAnswer) return false;
    const error = validateShortAnswerItem(question.shortAnswer);
    if (error) {
      console.warn(
        `[short-answer] dropping invalid item ${question.id}: ${error}`,
      );
      return false;
    }
    return true;
  });
}
