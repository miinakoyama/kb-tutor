import type {
  StandardRow,
  StudentRow,
} from "@/lib/analytics/teacher-dashboard-server";

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

export function downloadStandardMetricsCsv(rows: StandardRow[]): void {
  const includeModeBreakdown = rows.some((row) => row.byMode !== undefined);
  const baseHeader = [
    "standard_id",
    "standard_label",
    "attempted",
    "correct",
    "accuracy_percent",
    "average_time_seconds",
    "status",
  ];
  const modeHeader = includeModeBreakdown
    ? [
        "practice_attempted",
        "practice_correct",
        "practice_accuracy_percent",
        "practice_students",
        "exam_attempted",
        "exam_correct",
        "exam_accuracy_percent",
        "exam_students",
        "review_attempted",
        "review_correct",
        "review_accuracy_percent",
        "review_students",
      ]
    : [];
  const header = joinCsvRow([...baseHeader, ...modeHeader]);
  const body = rows.map((row) => {
    const base: Array<string | number> = [
      row.standardId,
      row.standardLabel,
      row.attempted,
      row.correct,
      row.accuracy,
      row.averageTimeSec,
      row.status,
    ];
    if (includeModeBreakdown) {
      const bm = row.byMode;
      base.push(
        bm?.practice.attempted ?? 0,
        bm?.practice.correct ?? 0,
        bm?.practice.accuracy ?? 0,
        bm?.practice.studentsAttempted ?? 0,
        bm?.exam.attempted ?? 0,
        bm?.exam.correct ?? 0,
        bm?.exam.accuracy ?? 0,
        bm?.exam.studentsAttempted ?? 0,
        bm?.review.attempted ?? 0,
        bm?.review.correct ?? 0,
        bm?.review.accuracy ?? 0,
        bm?.review.studentsAttempted ?? 0,
      );
    }
    return joinCsvRow(base);
  });
  downloadCsv([header, ...body].join("\n"), "teacher-dashboard-by-standard.csv");
}

export function downloadStudentMetricsCsv(rows: StudentRow[]): void {
  const header = joinCsvRow([
    "student_id",
    "student_label",
    "attempted",
    "correct",
    "accuracy_percent",
    "average_time_seconds",
    "status",
    "low_and_fast",
  ]);
  const body = rows.map((row) =>
    joinCsvRow([
      row.studentId,
      row.label,
      row.attempted,
      row.correct,
      row.accuracy,
      row.averageTimeSec,
      row.status,
      row.isLowAndFast ? "yes" : "no",
    ]),
  );
  downloadCsv([header, ...body].join("\n"), "teacher-dashboard-by-student.csv");
}
