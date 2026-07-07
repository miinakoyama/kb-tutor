import { GraduationCap, NotebookPen, RotateCcw } from "lucide-react";
import type {
  AssignmentMode,
  StudentAssignmentListItem,
} from "@/lib/student-assignments";

export const ASSIGNMENT_MODE_META = {
  practice: {
    Icon: NotebookPen,
    label: "Practice",
    color: "var(--assignment-mode-practice)",
    pillBg: "var(--assignment-mode-practice-bg)",
    pillBorder: "var(--assignment-mode-practice-bg)",
  },
  exam: {
    Icon: GraduationCap,
    label: "Exam",
    color: "var(--assignment-mode-exam)",
    pillBg: "var(--assignment-mode-exam-bg)",
    pillBorder: "var(--assignment-mode-exam-bg)",
  },
  review: {
    Icon: RotateCcw,
    label: "Review",
    color: "var(--assignment-mode-review)",
    pillBg: "var(--assignment-mode-review-bg)",
    pillBorder: "var(--assignment-mode-review-bg)",
  },
} as const satisfies Record<
  AssignmentMode,
  {
    Icon: typeof NotebookPen;
    label: string;
    color: string;
    pillBg: string;
    pillBorder: string;
  }
>;

export function getAssignmentModeMeta(mode: AssignmentMode) {
  return ASSIGNMENT_MODE_META[mode] ?? ASSIGNMENT_MODE_META.practice;
}

export function estimateQuestionCount(targetMinutes: number): number {
  return Math.max(6, Math.min(40, Math.round(targetMinutes / 1.8)));
}

export function isAssignmentOverdue(
  assignment: Pick<StudentAssignmentListItem, "due_date" | "status">,
  now: Date = new Date(),
): boolean {
  if (assignment.status === "completed" || !assignment.due_date) return false;

  const dueTime = new Date(assignment.due_date).getTime();
  const nowTime = now.getTime();
  return Number.isFinite(dueTime) && Number.isFinite(nowTime) && dueTime < nowTime;
}
