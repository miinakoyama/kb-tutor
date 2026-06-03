import type { StandardDrillDownPayload } from "@/lib/analytics/teacher-analytics-types";

function escapeCsvValue(value: string | number): string {
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function joinCsvRow(columns: Array<string | number>): string {
  return columns.map(escapeCsvValue).join(",");
}

function downloadCsv(content: string, fileName: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function pct(value: number): number {
  return Math.round(value * 1000) / 10;
}

export function downloadStandardDrillDownCsv(
  payload: StandardDrillDownPayload,
): void {
  const header = joinCsvRow([
    "standard_id",
    "question_id",
    "attempted",
    "unique_students",
    "correct",
    "accuracy_percent",
    "bucket",
    "average_time_seconds",
    "practice_attempted",
    "practice_correct",
    "practice_accuracy_percent",
    "exam_attempted",
    "exam_correct",
    "exam_accuracy_percent",
    "review_attempted",
    "review_correct",
    "review_accuracy_percent",
    "stem_preview",
  ]);
  const body = payload.questions.map((row) =>
    joinCsvRow([
      payload.standardId,
      row.questionId,
      row.attempted,
      row.uniqueStudents,
      row.correct,
      pct(row.accuracy),
      row.bucket,
      Math.round(row.averageTimeSec),
      row.byMode.practice.attempted,
      row.byMode.practice.correct,
      pct(row.byMode.practice.accuracy),
      row.byMode.exam.attempted,
      row.byMode.exam.correct,
      pct(row.byMode.exam.accuracy),
      row.byMode.review.attempted,
      row.byMode.review.correct,
      pct(row.byMode.review.accuracy),
      row.preview?.text ?? "",
    ]),
  );
  const safeStandardId = payload.standardId.replace(/[^A-Za-z0-9._-]/g, "_");
  downloadCsv(
    [header, ...body].join("\n"),
    `teacher-dashboard-standard-${safeStandardId}.csv`,
  );
}
