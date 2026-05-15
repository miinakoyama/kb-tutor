import type {
  AssignmentProgressResponse,
  StudentProgressRow,
} from "@/lib/analytics/assignment-progress";

type CsvValue = string | number | null;

function escapeCsvValue(value: CsvValue): string {
  if (value === null) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function joinCsvRow(columns: CsvValue[]): string {
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

export function buildAssignmentProgressCsv(
  data: AssignmentProgressResponse,
  rows: StudentProgressRow[] = data.rows,
): string {
  const baseHeader = [
    "student_user_id",
    "student_id",
    "student_label",
    "school_id",
    "completed_count",
    "in_progress_count",
    "not_started_count",
  ];
  const assignmentHeader = data.assignments.flatMap((assignment) => {
    const prefix = assignment.title;
    return [
      `${prefix} status`,
      `${prefix} answered_count`,
      `${prefix} total_questions`,
      `${prefix} completed_at`,
    ];
  });

  const csvRows = [
    joinCsvRow([...baseHeader, ...assignmentHeader]),
    ...rows.map((row) => {
      const base: CsvValue[] = [
        row.studentId,
        row.studentIdCode,
        row.label,
        row.classId,
        row.completedCount,
        row.inProgressCount,
        row.notStartedCount,
      ];
      const assignmentValues = data.assignments.flatMap((assignment) => {
        const progress = row.progress[assignment.assignmentId];
        if (!progress) {
          return ["not_assigned", null, null, null] satisfies CsvValue[];
        }
        return [
          progress.status,
          progress.answeredCount,
          progress.totalQuestions,
          progress.lastCompletedAt,
        ] satisfies CsvValue[];
      });
      return joinCsvRow([...base, ...assignmentValues]);
    }),
  ];

  return csvRows.join("\n");
}

export function downloadAssignmentProgressCsv(
  data: AssignmentProgressResponse,
  rows: StudentProgressRow[] = data.rows,
): void {
  downloadCsv(
    buildAssignmentProgressCsv(data, rows),
    "assignment-progress.csv",
  );
}
