import type { Question } from "@/types/question";

export function downloadAsJson(questions: Question[], filename: string): void {
  const json = JSON.stringify(questions, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, `${filename}.json`);
}

export function downloadAsTsv(questions: Question[], filename: string): void {
  const headers = [
    "id",
    "topic",
    "module",
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

  const rows = questions.map((q) => {
    const optionA = q.options.find((o) => o.id === "A");
    const optionB = q.options.find((o) => o.id === "B");
    const optionC = q.options.find((o) => o.id === "C");
    const optionD = q.options.find((o) => o.id === "D");

    return [
      q.id,
      q.topic,
      q.module.toString(),
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

function escapeForTsv(value: string): string {
  if (value.includes("\t") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
