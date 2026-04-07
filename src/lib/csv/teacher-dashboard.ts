import type { StandardMetric, StudentMetric } from "@/lib/analytics/teacher-dashboard";

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

export function downloadStandardMetricsCsv(rows: StandardMetric[]): void {
  const header = joinCsvRow([
    "standard_id",
    "standard_label",
    "attempted",
    "correct",
    "accuracy_percent",
    "average_time_seconds",
  ]);
  const body = rows.map((row) =>
    joinCsvRow([
      row.standardId,
      row.standardLabel,
      row.attempted,
      row.correct,
      row.accuracy,
      row.averageTimeSec,
    ]),
  );
  downloadCsv([header, ...body].join("\n"), "teacher-dashboard-by-standard.csv");
}

export function downloadStudentMetricsCsv(rows: StudentMetric[]): void {
  const header = joinCsvRow([
    "student_id",
    "total_answered",
    "total_correct",
    "accuracy_percent",
  ]);
  const body = rows.map((row) =>
    joinCsvRow([row.studentId, row.totalAnswered, row.totalCorrect, row.accuracy]),
  );
  downloadCsv([header, ...body].join("\n"), "teacher-dashboard-by-student.csv");
}
