import type { Question } from "@/types/question";
import { stripLatexDelimitersOptional } from "@/lib/latex";

export function downloadAsJson(questions: Question[], filename: string): void {
  const sanitized = questions.map(sanitizeQuestionForExport);
  const json = JSON.stringify(sanitized, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, `${filename}.json`);
}

export function downloadAsTsv(questions: Question[], filename: string): void {
  const sanitizedQuestions = questions.map(sanitizeQuestionForExport);
  const headers = [
    "id",
    "topic",
    "module",
    "standardId",
    "standardLabel",
    "dok",
    "text",
    "optionA",
    "optionB",
    "optionC",
    "optionD",
    "correctOption",
    "feedbackA",
    "feedbackB",
    "feedbackC",
    "feedbackD",
    "focusHint",
    "keyKnowledge",
    "commonMisconception",
    "rationaleQuestion",
    "rationaleOptions",
    "rationaleCorrect",
    "rationaleExplanation",
    "diagramType",
    "diagramData",
  ];

  const rows = sanitizedQuestions.map((q) => {
    const optionA = q.options.find((o) => o.id === "A");
    const optionB = q.options.find((o) => o.id === "B");
    const optionC = q.options.find((o) => o.id === "C");
    const optionD = q.options.find((o) => o.id === "D");

    return [
      q.id,
      q.topic,
      q.module.toString(),
      q.standardId || "",
      q.standardLabel || "",
      q.dok?.toString() || "",
      q.text,
      optionA?.text || "",
      optionB?.text || "",
      optionC?.text || "",
      optionD?.text || "",
      q.correctOptionId,
      optionA?.feedback || "",
      optionB?.feedback || "",
      optionC?.feedback || "",
      optionD?.feedback || "",
      q.focusHint || "",
      q.keyKnowledge || "",
      q.commonMisconception || "",
      q.rationaleQuestion?.text || "",
      q.rationaleQuestion?.options.map((o) => `${o.id}:${o.text}`).join("|") || "",
      q.rationaleQuestion?.correctOptionId || "",
      q.rationaleQuestion?.explanation || "",
      q.diagram?.type || "",
      q.diagram ? JSON.stringify(q.diagram.data) : "",
    ].map(escapeForTsv);
  });

  const tsv = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join(
    "\n"
  );

  const blob = new Blob([tsv], { type: "text/tab-separated-values" });
  downloadBlob(blob, `${filename}.tsv`);
}

export function downloadAsText(questions: Question[], filename: string): void {
  const sanitizedQuestions = questions.map(sanitizeQuestionForExport);
  const text = sanitizedQuestions
    .map((q, index) => {
      const correctOption = q.options.find((o) => o.id === q.correctOptionId);
      const optionsSection = q.options
        .map((option) => {
          const feedback = option.feedback?.trim() || "N/A";
          return `- ${option.id}. ${option.text}\n  Feedback: ${feedback}`;
        })
        .join("\n");

      return [
        `Question ${index + 1}`,
        `Question Text: ${q.text}`,
        "Options:",
        optionsSection,
        `Correct Answer: ${q.correctOptionId}${
          correctOption?.text ? ` (${correctOption.text})` : ""
        }`,
      ].join("\n");
    })
    .join("\n\n----------------------------------------\n\n");

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, `${filename}.txt`);
}

function escapeForTsv(value: string): string {
  if (value.includes("\t") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function sanitizeQuestionForExport(question: Question): Question {
  return {
    ...question,
    text: stripLatexDelimitersOptional(question.text) || "",
    explanation: stripLatexDelimitersOptional(question.explanation),
    commonMisconception: stripLatexDelimitersOptional(question.commonMisconception),
    focusHint: stripLatexDelimitersOptional(question.focusHint),
    keyKnowledge: stripLatexDelimitersOptional(question.keyKnowledge),
    options: question.options.map((option) => ({
      ...option,
      text: stripLatexDelimitersOptional(option.text) || "",
      feedback: stripLatexDelimitersOptional(option.feedback),
    })),
    rationaleQuestion: question.rationaleQuestion
      ? {
          ...question.rationaleQuestion,
          text: stripLatexDelimitersOptional(question.rationaleQuestion.text) || "",
          explanation: stripLatexDelimitersOptional(
            question.rationaleQuestion.explanation
          ) || "",
          options: question.rationaleQuestion.options.map((option) => ({
            ...option,
            text: stripLatexDelimitersOptional(option.text) || "",
          })),
        }
      : undefined,
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
