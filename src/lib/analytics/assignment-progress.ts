/**
 * Per-student assignment progress aggregation.
 *
 * Drives the "Assignment progress" matrix on the teacher dashboard, showing
 * whether each student is Completed / In progress / Not started for every
 * assignment that targets them.
 *
 * Pure / side-effect-free so the route handler can load rows from Supabase
 * and pass them in without forcing the aggregation to depend on any client.
 */

export type AssignmentProgressStatus = "completed" | "in_progress" | "not_started";

export interface AssignmentInfo {
  id: string;
  title: string;
  schoolId: string;
  dueDate: string | null;
  /** Total number of questions for practice/exam; null for review mode. */
  totalQuestions: number | null;
  mode: "practice" | "exam" | "review" | null;
}

export interface AssignmentTargetRow {
  assignmentId: string;
  studentUserId: string;
  /** ISO timestamp when the student last completed this assignment, or null. */
  lastCompletedAt: string | null;
}

/**
 * Minimal attempt shape for progress calculation. We only care about which
 * (student, assignment) pairs have any non-null attempt recorded.
 */
export interface AttemptProgressRow {
  userId: string;
  assignmentId: string;
  questionId: string;
}

export interface StudentAssignmentProgress {
  assignmentId: string;
  status: AssignmentProgressStatus;
  /** Non-null when the student completed at least once. */
  lastCompletedAt: string | null;
  /** Distinct questions the student has answered for this assignment. */
  answeredCount: number;
  /** Total questions in the assignment (null for review mode). */
  totalQuestions: number | null;
}

export interface StudentProgressRow {
  studentId: string;
  label: string;
  classId: string | null;
  progress: Record<string, StudentAssignmentProgress>;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
}

export interface AssignmentProgressSummary {
  assignmentId: string;
  title: string;
  dueDate: string | null;
  mode: "practice" | "exam" | "review" | null;
  totalTargets: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
}

export interface AssignmentProgressResponse {
  assignments: AssignmentProgressSummary[];
  rows: StudentProgressRow[];
}

interface BuildArgs {
  assignments: AssignmentInfo[];
  targets: AssignmentTargetRow[];
  attempts: AttemptProgressRow[];
  students: { id: string; label: string; classId: string | null }[];
}

/**
 * Decide a status for one (student, assignment) pair.
 *
 * Priority:
 *   1. If the student has a `last_completed_at` timestamp -> completed.
 *   2. Else, if they have answered at least one question for the assignment -> in_progress.
 *   3. Otherwise -> not_started.
 *
 * We intentionally do NOT downgrade from completed when attempts are missing;
 * completion is a deliberate client-side ping and is the single source of truth.
 */
export function classifyAssignmentProgress(
  lastCompletedAt: string | null,
  answeredCount: number,
): AssignmentProgressStatus {
  if (lastCompletedAt) return "completed";
  if (answeredCount > 0) return "in_progress";
  return "not_started";
}

export function buildAssignmentProgress(args: BuildArgs): AssignmentProgressResponse {
  const { assignments, targets, attempts, students } = args;

  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const studentIds = new Set(students.map((s) => s.id));

  // assignment_id -> student_user_id -> target row
  const targetByAssignmentStudent = new Map<string, Map<string, AssignmentTargetRow>>();
  for (const target of targets) {
    if (!assignmentById.has(target.assignmentId)) continue;
    if (!studentIds.has(target.studentUserId)) continue;
    let inner = targetByAssignmentStudent.get(target.assignmentId);
    if (!inner) {
      inner = new Map();
      targetByAssignmentStudent.set(target.assignmentId, inner);
    }
    inner.set(target.studentUserId, target);
  }

  // (assignmentId, userId) -> Set<questionId> for distinct answered count
  const answeredQuestions = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    if (!assignmentById.has(attempt.assignmentId)) continue;
    if (!studentIds.has(attempt.userId)) continue;
    const key = `${attempt.assignmentId}::${attempt.userId}`;
    let set = answeredQuestions.get(key);
    if (!set) {
      set = new Set();
      answeredQuestions.set(key, set);
    }
    set.add(attempt.questionId);
  }

  const summaryByAssignment = new Map<string, AssignmentProgressSummary>();
  for (const a of assignments) {
    summaryByAssignment.set(a.id, {
      assignmentId: a.id,
      title: a.title,
      dueDate: a.dueDate,
      mode: a.mode,
      totalTargets: 0,
      completedCount: 0,
      inProgressCount: 0,
      notStartedCount: 0,
    });
  }

  const rows: StudentProgressRow[] = students.map((student) => {
    const progress: Record<string, StudentAssignmentProgress> = {};
    let completedCount = 0;
    let inProgressCount = 0;
    let notStartedCount = 0;

    for (const assignment of assignments) {
      const target = targetByAssignmentStudent.get(assignment.id)?.get(student.id);
      if (!target) continue;

      const answered =
        answeredQuestions.get(`${assignment.id}::${student.id}`)?.size ?? 0;
      const status = classifyAssignmentProgress(target.lastCompletedAt, answered);

      progress[assignment.id] = {
        assignmentId: assignment.id,
        status,
        lastCompletedAt: target.lastCompletedAt,
        answeredCount: answered,
        totalQuestions: assignment.totalQuestions,
      };

      if (status === "completed") completedCount += 1;
      else if (status === "in_progress") inProgressCount += 1;
      else notStartedCount += 1;

      const summary = summaryByAssignment.get(assignment.id);
      if (summary) {
        summary.totalTargets += 1;
        if (status === "completed") summary.completedCount += 1;
        else if (status === "in_progress") summary.inProgressCount += 1;
        else summary.notStartedCount += 1;
      }
    }

    return {
      studentId: student.id,
      label: student.label,
      classId: student.classId,
      progress,
      completedCount,
      inProgressCount,
      notStartedCount,
    };
  });

  const assignmentsSummary = assignments
    .map((a) => summaryByAssignment.get(a.id)!)
    // Sort: assignments with a due date first (earliest first), then by title.
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        const diff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (diff !== 0) return diff;
      } else if (a.dueDate) {
        return -1;
      } else if (b.dueDate) {
        return 1;
      }
      return a.title.localeCompare(b.title);
    });

  rows.sort((a, b) => a.label.localeCompare(b.label));

  return {
    assignments: assignmentsSummary,
    rows,
  };
}
