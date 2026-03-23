import type { AnswerRecord, Question } from "@/types/question";

function cleanFeedback(feedback?: string): string {
  if (!feedback) return "";
  return feedback.replace(/^(Correct\.|Incorrect\.)\s*/i, "").trim();
}

export function buildChoicesReadText(question: Question): string {
  return question.options.map((opt) => `${opt.id}. ${opt.text}`).join(" ");
}

interface FeedbackTextOptions {
  includeKeyKnowledge?: boolean;
  includeMisconception?: boolean;
}

export function buildFeedbackReadText(
  question: Question,
  answer?: AnswerRecord,
  options: FeedbackTextOptions = {},
): string {
  if (!answer) return "";

  const { includeKeyKnowledge = false, includeMisconception = false } = options;
  const selectedOption = question.options.find(
    (opt) => opt.id === answer.selectedOptionId,
  );
  const correctOption = question.options.find(
    (opt) => opt.id === question.correctOptionId,
  );
  const displayOption = selectedOption || correctOption;
  const displayIsCorrect = selectedOption
    ? answer.selectedOptionId === question.correctOptionId
    : true;

  const parts: string[] = [];
  parts.push(displayIsCorrect ? "Correct." : "Incorrect.");

  const feedback = cleanFeedback(displayOption?.feedback);
  if (feedback) {
    parts.push(feedback);
  }

  if (includeKeyKnowledge && question.keyKnowledge) {
    parts.push(`Key idea. ${question.keyKnowledge}`);
  }

  if (
    includeMisconception &&
    !displayIsCorrect &&
    question.commonMisconception
  ) {
    parts.push(`Common misconception. ${question.commonMisconception}`);
  }

  return parts.join(" ").trim();
}
