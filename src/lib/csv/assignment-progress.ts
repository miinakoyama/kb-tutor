import type {
  AssignmentProgressResponse,
  StudentProgressRow,
} from "@/lib/analytics/assignment-progress";

type CsvValue = string | number | null;
const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);
const LEADING_WHITESPACE_OR_CONTROL = /^[\s\u0000-\u001f\u007f]*/u;

function startsWithSpreadsheetFormula(text: string): boolean {
  const firstVisibleIndex = text.match(LEADING_WHITESPACE_OR_CONTROL)?.[0]
    .length ?? 0;
  return FORMULA_PREFIXES.has(text.charAt(firstVisibleIndex));
}

function escapeCsvValue(value: CsvValue): string {
  if (value === null) return "";
  let text = String(value);
  if (startsWithSpreadsheetFormula(text)) {
    text = `'${text}`;
  }
  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
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

function formatDueDateForHeader(dueDate: string | null): string {
  if (!dueDate) return "no due date";
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return dueDate;
  return parsed.toISOString().slice(0, 10);
}

function buildAssignmentColumnPrefixes(
  assignments: AssignmentProgressResponse["assignments"],
): Map<string, string> {
  const titleCounts = new Map<string, number>();
  for (const assignment of assignments) {
    titleCounts.set(assignment.title, (titleCounts.get(assignment.title) ?? 0) + 1);
  }

  const prefixCounts = new Map<string, number>();
  const prefixes = new Map<string, string>();
  for (const assignment of assignments) {
    const duplicateTitle = (titleCounts.get(assignment.title) ?? 0) > 1;
    const basePrefix = duplicateTitle
      ? `${assignment.title} - ${assignment.mode ?? "unknown mode"} - ${formatDueDateForHeader(assignment.dueDate)}`
      : assignment.title;
    const seen = prefixCounts.get(basePrefix) ?? 0;
    prefixCounts.set(basePrefix, seen + 1);
    prefixes.set(
      assignment.assignmentId,
      seen === 0 ? basePrefix : `${basePrefix} #${seen + 1}`,
    );
  }
  return prefixes;
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
  const assignmentPrefixes = buildAssignmentColumnPrefixes(data.assignments);
  const assignmentHeader = data.assignments.flatMap((assignment) => {
    const prefix = assignmentPrefixes.get(assignment.assignmentId) ?? assignment.title;
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
