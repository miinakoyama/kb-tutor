import type { StudentProfilePayload } from "@/lib/analytics/teacher-analytics-types";

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

export function downloadStudentProfileCsv(
  payload: StudentProfilePayload,
): void {
  const header = joinCsvRow([
    "attempt_id",
    "question_id",
    "standard_id",
    "standard_label",
    "mode",
    "assignment_id",
    "assignment_label",
    "selected_option_id",
    "selected_option_text",
    "is_correct",
    "correct_option_id",
    "time_spent_seconds",
    "answered_at",
    "question_stem_preview",
  ]);
  const body = payload.answers.rows.map((row) =>
    joinCsvRow([
      row.attemptId,
      row.questionId,
      row.standardId ?? "",
      row.standardLabel ?? "",
      row.mode,
      row.assignmentId ?? "",
      row.assignmentLabel,
      row.selectedOptionId,
      row.selectedOptionText,
      row.isCorrect ? "yes" : "no",
      row.correctOptionId,
      row.timeSpentSec ?? "",
      row.answeredAt,
      row.questionStem,
    ]),
  );
  const safeId = payload.student.id.replace(/[^A-Za-z0-9._-]/g, "_");
  downloadCsv(
    [header, ...body].join("\n"),
    `teacher-dashboard-student-${safeId}.csv`,
  );
}
