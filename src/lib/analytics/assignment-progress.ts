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
 * Attempt shape for progress + completed-run scoring.
 */
export interface AttemptProgressRow {
  userId: string;
  assignmentId: string;
  questionId: string;
  isCorrect: boolean;
  /** ISO timestamp; null/invalid rows are skipped for score windows. */
  answeredAt: string | null;
}

/** One row from `assignment_completions`, used to bound the last completed run. */
export interface AssignmentCompletionRow {
  assignmentId: string;
  studentUserId: string;
  completedAt: string;
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
  /**
   * Score for the last completed run only. Null when status is not completed,
   * or when no scored attempts exist in that run window.
   */
  correctCount: number | null;
  /** Distinct questions answered in the last completed run. */
  scoredTotal: number | null;
  /** Rounded percent correct in the last completed run. */
  scorePercent: number | null;
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
  /** Optional; used to bound the last completed run when a student has retries. */
  completions?: AssignmentCompletionRow[];
}

type LatestEntry = { isCorrect: boolean; answeredAt: number };

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

function emptyScore(): Pick<
  StudentAssignmentProgress,
  "correctCount" | "scoredTotal" | "scorePercent"
> {
  return { correctCount: null, scoredTotal: null, scorePercent: null };
}

function scoreFromLatest(
  latest: Map<string, LatestEntry> | undefined,
): Pick<StudentAssignmentProgress, "correctCount" | "scoredTotal" | "scorePercent"> {
  if (!latest || latest.size === 0) return emptyScore();
  let correct = 0;
  for (const entry of latest.values()) {
    if (entry.isCorrect) correct += 1;
  }
  const total = latest.size;
  return {
    correctCount: correct,
    scoredTotal: total,
    scorePercent: Math.round((correct / total) * 100),
  };
}

/**
 * Build per-(assignment, student) maps of the latest attempt per question in
 * the last completed run window: (prevCompletedAt, lastCompletedAt].
 */
function buildLastCompletedRunLatest(args: {
  attempts: AttemptProgressRow[];
  lastCompletedByAssignmentStudent: Map<string, Map<string, string>>;
  completionTimesByAssignmentStudent: Map<string, Map<string, number[]>>;
  studentIds: Set<string>;
  assignmentIds: Set<string>;
}): Map<string, Map<string, Map<string, LatestEntry>>> {
  const {
    attempts,
    lastCompletedByAssignmentStudent,
    completionTimesByAssignmentStudent,
    studentIds,
    assignmentIds,
  } = args;

  const lastRunLatest = new Map<string, Map<string, Map<string, LatestEntry>>>();

  for (const attempt of attempts) {
    if (!assignmentIds.has(attempt.assignmentId)) continue;
    if (!studentIds.has(attempt.userId)) continue;
    if (!attempt.answeredAt) continue;

    const lastCompletedAt = lastCompletedByAssignmentStudent
      .get(attempt.assignmentId)
      ?.get(attempt.userId);
    if (!lastCompletedAt) continue;

    const answeredAtMs = new Date(attempt.answeredAt).getTime();
    const lastCompletedMs = new Date(lastCompletedAt).getTime();
    if (!Number.isFinite(answeredAtMs) || !Number.isFinite(lastCompletedMs)) {
      continue;
    }
    // Attempts after the last completion belong to a newer (in-progress) run.
    if (answeredAtMs > lastCompletedMs) continue;

    const completionTimes =
      completionTimesByAssignmentStudent
        .get(attempt.assignmentId)
        ?.get(attempt.userId) ?? [];
    const prevCompletedMs =
      completionTimes.length >= 2
        ? completionTimes[completionTimes.length - 2]!
        : -Infinity;
    if (answeredAtMs <= prevCompletedMs) continue;

    let byUser = lastRunLatest.get(attempt.assignmentId);
    if (!byUser) {
      byUser = new Map();
      lastRunLatest.set(attempt.assignmentId, byUser);
    }
    let byQuestion = byUser.get(attempt.userId);
    if (!byQuestion) {
      byQuestion = new Map();
      byUser.set(attempt.userId, byQuestion);
    }
    const prior = byQuestion.get(attempt.questionId);
    if (!prior || answeredAtMs >= prior.answeredAt) {
      byQuestion.set(attempt.questionId, {
        isCorrect: attempt.isCorrect,
        answeredAt: answeredAtMs,
      });
    }
  }

  return lastRunLatest;
}

export function buildAssignmentProgress(args: BuildArgs): AssignmentProgressResponse {
  const { assignments, targets, attempts, students, completions = [] } = args;

  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const studentIds = new Set(students.map((s) => s.id));
  const assignmentIds = new Set(assignments.map((a) => a.id));

  // assignment_id -> student_user_id -> target row
  const targetByAssignmentStudent = new Map<string, Map<string, AssignmentTargetRow>>();
  const lastCompletedByAssignmentStudent = new Map<string, Map<string, string>>();
  for (const target of targets) {
    if (!assignmentById.has(target.assignmentId)) continue;
    if (!studentIds.has(target.studentUserId)) continue;
    let inner = targetByAssignmentStudent.get(target.assignmentId);
    if (!inner) {
      inner = new Map();
      targetByAssignmentStudent.set(target.assignmentId, inner);
    }
    inner.set(target.studentUserId, target);

    if (target.lastCompletedAt) {
      let lastInner = lastCompletedByAssignmentStudent.get(target.assignmentId);
      if (!lastInner) {
        lastInner = new Map();
        lastCompletedByAssignmentStudent.set(target.assignmentId, lastInner);
      }
      lastInner.set(target.studentUserId, target.lastCompletedAt);
    }
  }

  // assignment_id -> student_user_id -> completedAt ms ascending
  const completionTimesByAssignmentStudent = new Map<string, Map<string, number[]>>();
  for (const row of completions) {
    if (!assignmentIds.has(row.assignmentId)) continue;
    if (!studentIds.has(row.studentUserId)) continue;
    const completedMs = new Date(row.completedAt).getTime();
    if (!Number.isFinite(completedMs)) continue;
    let byStudent = completionTimesByAssignmentStudent.get(row.assignmentId);
    if (!byStudent) {
      byStudent = new Map();
      completionTimesByAssignmentStudent.set(row.assignmentId, byStudent);
    }
    let times = byStudent.get(row.studentUserId);
    if (!times) {
      times = [];
      byStudent.set(row.studentUserId, times);
    }
    times.push(completedMs);
  }
  for (const byStudent of completionTimesByAssignmentStudent.values()) {
    for (const times of byStudent.values()) {
      times.sort((a, b) => a - b);
    }
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

  const lastRunLatest = buildLastCompletedRunLatest({
    attempts,
    lastCompletedByAssignmentStudent,
    completionTimesByAssignmentStudent,
    studentIds,
    assignmentIds,
  });

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
      const score =
        status === "completed"
          ? scoreFromLatest(lastRunLatest.get(assignment.id)?.get(student.id))
          : emptyScore();

      progress[assignment.id] = {
        assignmentId: assignment.id,
        status,
        lastCompletedAt,
        answeredCount: answered,
        totalQuestions: assignment.totalQuestions,
        ...score,
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
