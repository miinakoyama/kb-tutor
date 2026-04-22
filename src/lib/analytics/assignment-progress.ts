/**
 * Per-student assignment progress aggregation.
 *
 * Drives the "Assignment progress" matrix on the teacher dashboard, showing
 * whether each student is Completed / In progress / Not started for every
 * assignment in their school. Rows in `assignment_targets` are optional: the
 * student app lists school assignments by membership, and targets only store
 * state such as `last_completed_at` once created.
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
  /** Roster / external id from `profiles.student_id` when set. */
  studentIdCode: string | null;
  /** School id (from `school_members.school_id`); used to match assignments. */
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
  students: {
    id: string;
    label: string;
    classId: string | null;
    studentIdCode?: string | null;
  }[];
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

  // assignmentId -> userId -> Set<questionId> (distinct answered count)
  const answeredByAssignmentUser = new Map<string, Map<string, Set<string>>>();
  for (const attempt of attempts) {
    if (!assignmentById.has(attempt.assignmentId)) continue;
    if (!studentIds.has(attempt.userId)) continue;
    let byUser = answeredByAssignmentUser.get(attempt.assignmentId);
    if (!byUser) {
      byUser = new Map();
      answeredByAssignmentUser.set(attempt.assignmentId, byUser);
    }
    let set = byUser.get(attempt.userId);
    if (!set) {
      set = new Set();
      byUser.set(attempt.userId, set);
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
      if (student.classId !== assignment.schoolId) {
        continue;
      }

      const target = targetByAssignmentStudent.get(assignment.id)?.get(student.id);
      const lastCompletedAt = target?.lastCompletedAt ?? null;

      const answered =
        answeredByAssignmentUser.get(assignment.id)?.get(student.id)?.size ?? 0;
      const status = classifyAssignmentProgress(lastCompletedAt, answered);

      progress[assignment.id] = {
        assignmentId: assignment.id,
        status,
        lastCompletedAt,
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
      studentIdCode: student.studentIdCode ?? null,
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

  return {
    assignments: assignmentsSummary,
    rows,
  };
}

/** Client-side row order / search helpers for the assignment progress matrix. */
export type AssignmentProgressRowSortKey =
  /** Most "not started" cells first, then lower completion share (for ties). */
  | "needs_attention"
  /** Higher share of completed work first (per student row). */
  | "highest_completion_first"
  | "student_id_asc"
  | "student_id_desc";

function rosterOrUserIdKey(row: StudentProgressRow): string {
  const code = row.studentIdCode?.trim();
  return code && code.length > 0 ? code : row.studentId;
}

/**
 * Sorts a copy of `rows` for display. Ties use roster / user id for stable order.
 */
export function sortAssignmentProgressRows(
  rows: StudentProgressRow[],
  key: AssignmentProgressRowSortKey,
): StudentProgressRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (key) {
      case "needs_attention": {
        const d = b.notStartedCount - a.notStartedCount;
        if (d !== 0) return d;
        const totalA = a.completedCount + a.inProgressCount + a.notStartedCount;
        const totalB = b.completedCount + b.inProgressCount + b.notStartedCount;
        const rateA = totalA > 0 ? a.completedCount / totalA : null;
        const rateB = totalB > 0 ? b.completedCount / totalB : null;
        if (rateA === null && rateB === null) {
          return rosterOrUserIdKey(a).localeCompare(rosterOrUserIdKey(b), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }
        if (rateA === null) return 1;
        if (rateB === null) return -1;
        const cmp = rateA - rateB;
        if (cmp !== 0) return cmp;
        return rosterOrUserIdKey(a).localeCompare(rosterOrUserIdKey(b), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      case "highest_completion_first": {
        const totalA = a.completedCount + a.inProgressCount + a.notStartedCount;
        const totalB = b.completedCount + b.inProgressCount + b.notStartedCount;
        const rateA = totalA > 0 ? a.completedCount / totalA : null;
        const rateB = totalB > 0 ? b.completedCount / totalB : null;
        if (rateA === null && rateB === null) {
          return rosterOrUserIdKey(a).localeCompare(rosterOrUserIdKey(b), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }
        if (rateA === null) return 1;
        if (rateB === null) return -1;
        const cmp = rateB - rateA;
        if (cmp !== 0) return cmp;
        return rosterOrUserIdKey(a).localeCompare(rosterOrUserIdKey(b), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      case "student_id_asc":
        return rosterOrUserIdKey(a).localeCompare(rosterOrUserIdKey(b), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      case "student_id_desc":
        return rosterOrUserIdKey(b).localeCompare(rosterOrUserIdKey(a), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      default:
        return 0;
    }
  });
  return copy;
}

/**
 * Case-insensitive match on display name, roster id, or internal user id.
 */
export function filterAssignmentProgressRowsByQuery(
  rows: StudentProgressRow[],
  query: string,
): StudentProgressRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    if (row.label.toLowerCase().includes(q)) return true;
    if (row.studentIdCode?.toLowerCase().includes(q)) return true;
    if (row.studentId.toLowerCase().includes(q)) return true;
    return false;
  });
}
