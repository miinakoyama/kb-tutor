import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Question } from "@/types/question";
import {
  incrementWrongCount,
  prioritizeQuestionsByWrongCount,
} from "@/lib/review-priority";

export type AssignmentMode = "practice" | "exam" | "review";

export type StudentAssignmentStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type StudentAssignmentProgress = {
  answered: number;
  total: number;
};

export type StudentAssignmentListItem = {
  id: string;
  title: string;
  due_date?: string | null;
  topics: string[];
  target_minutes: number;
  mode: AssignmentMode;
  randomize_order: boolean;
  max_questions: number | null;
  instructions: string | null;
  status: StudentAssignmentStatus;
  last_completed_at: string | null;
  progress: StudentAssignmentProgress;
};

export type StudentAssignmentListResult = {
  assignments: StudentAssignmentListItem[];
  error: string | null;
};

function toAssignmentMode(value: unknown): AssignmentMode {
  if (value === "practice" || value === "exam" || value === "review") {
    return value;
  }
  return "practice";
}

type AssignmentBaseFields = Omit<
  StudentAssignmentListItem,
  "status" | "last_completed_at" | "progress"
>;

function toAssignmentBase(row: Record<string, unknown>): AssignmentBaseFields {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    due_date: (row.due_date as string | null | undefined) ?? null,
    topics: Array.isArray(row.topics)
      ? (row.topics as unknown[]).map((t) => String(t))
      : [],
    target_minutes:
      typeof row.target_minutes === "number" ? row.target_minutes : 20,
    mode: toAssignmentMode(row.mode),
    randomize_order: row.randomize_order !== false,
    max_questions:
      typeof row.max_questions === "number" ? row.max_questions : null,
    instructions:
      typeof row.instructions === "string" && row.instructions.length > 0
        ? row.instructions
        : null,
  };
}

async function fetchAssignmentList(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<StudentAssignmentListResult> {
  // Resolve assignments through school membership rather than
  // assignment_targets so that a student who was added to a school *after*
  // an assignment was created still sees the assignment. assignment_targets
  // is consulted only for per-student state like last_completed_at.
  //
  // We authenticate via the auth-scoped client for the school_members
  // lookup (RLS restricts students to their own memberships), and then use
  // the admin client for the rest of the DB state. Two reasons:
  //   1. `assignments_read_scoped` only grants SELECT via
  //      assignment_targets / created_by / admin, so a late-joined student
  //      would silently get 0 rows from an auth-scoped query.
  //   2. `assignment_targets_read_scoped` and `assignments_read_scoped`
  //      mutually reference each other via EXISTS() sub-queries, which
  //      Postgres flags as "infinite recursion detected in policy for
  //      relation assignment_targets" when a student-auth client queries
  //      either table.
  //   3. `assignment_question_snapshots` has RLS enabled but no SELECT
  //      policy, so an auth-scoped query returns 0 rows with no error.
  // `attempts` uses a simple `user_id = auth.uid()` policy with no cross-
  // table recursion, so it can stay auth-scoped.
  const { data: memberRows, error: memberError } = await supabase
    .from("school_members")
    .select("school_id")
    .eq("student_user_id", studentUserId);
  if (memberError) {
    return { assignments: [], error: memberError.message };
  }
  const schoolIds = Array.from(
    new Set((memberRows ?? []).map((row) => String(row.school_id))),
  );
  if (schoolIds.length === 0) {
    return { assignments: [], error: null };
  }

  const admin = createSupabaseAdminClient();
  const { data: assignmentRows, error: assignmentsError } = await admin
    .from("assignments")
    .select(
      "id,title,due_date,module_ids,topics,target_minutes,mode,randomize_order,max_questions,instructions,created_at",
    )
    .in("school_id", schoolIds)
    .order("created_at", { ascending: false });
  if (assignmentsError) {
    return { assignments: [], error: assignmentsError.message };
  }

  const orderedIds: string[] = (assignmentRows ?? []).map((row) =>
    String(row.id),
  );
  if (orderedIds.length === 0) {
    return { assignments: [], error: null };
  }

  const [
    { data: targetRows, error: targetsError },
    { data: snapshotRows, error: snapshotError },
    { data: attemptRows, error: attemptError },
  ] = await Promise.all([
    admin
      .from("assignment_targets")
      .select("assignment_id, last_completed_at")
      .eq("student_user_id", studentUserId)
      .in("assignment_id", orderedIds),
    admin
      .from("assignment_question_snapshots")
      .select("assignment_id,question_id")
      .in("assignment_id", orderedIds),
    supabase
      .from("attempts")
      .select("assignment_id,question_id,answered_at")
      .eq("user_id", studentUserId)
      .in("assignment_id", orderedIds),
  ]);

  if (targetsError) {
    return { assignments: [], error: targetsError.message };
  }
  if (snapshotError) {
    return { assignments: [], error: snapshotError.message };
  }
  if (attemptError) {
    return { assignments: [], error: attemptError.message };
  }

  const lastCompletedByAssignment = new Map<string, string | null>();
  for (const row of targetRows ?? []) {
    lastCompletedByAssignment.set(
      String(row.assignment_id),
      (row.last_completed_at as string | null | undefined) ?? null,
    );
  }

  const snapshotCountByAssignment = new Map<string, number>();
  for (const row of snapshotRows ?? []) {
    const id = String(row.assignment_id);
    snapshotCountByAssignment.set(
      id,
      (snapshotCountByAssignment.get(id) ?? 0) + 1,
    );
  }

  // Only count attempts from the _current_ run, i.e. answered strictly after
  // last_completed_at. This way when a student Restarts a completed
  // assignment, progress resets to 0/N without needing a destructive action.
  const answeredQuestionsByAssignment = new Map<string, Set<string>>();
  for (const row of attemptRows ?? []) {
    const id = String(row.assignment_id);
    const lastCompletedAt = lastCompletedByAssignment.get(id) ?? null;
    if (lastCompletedAt) {
      const answeredAt = row.answered_at as string | null | undefined;
      if (!answeredAt) continue;
      if (new Date(answeredAt).getTime() <= new Date(lastCompletedAt).getTime()) {
        continue;
      }
    }
    if (!answeredQuestionsByAssignment.has(id)) {
      answeredQuestionsByAssignment.set(id, new Set());
    }
    answeredQuestionsByAssignment.get(id)!.add(String(row.question_id));
  }

  const baseById = new Map<string, AssignmentBaseFields>(
    (assignmentRows ?? []).map((a) => [
      String(a.id),
      toAssignmentBase(a as Record<string, unknown>),
    ]),
  );

  const assignments = orderedIds
    .map((id): StudentAssignmentListItem | null => {
      const base = baseById.get(id);
      if (!base) return null;
      const lastCompletedAt = lastCompletedByAssignment.get(id) ?? null;
      const answeredSet = answeredQuestionsByAssignment.get(id) ?? new Set();
      const progress = computeProgress(base, {
        snapshotCount: snapshotCountByAssignment.get(id) ?? 0,
        answeredCount: answeredSet.size,
      });
      const status = computeStatus({
        lastCompletedAt,
        answeredCount: answeredSet.size,
      });
      return {
        ...base,
        status,
        last_completed_at: lastCompletedAt,
        progress,
      };
    })
    .filter((a): a is StudentAssignmentListItem => a != null);

  return { assignments, error: null };
}

function computeProgress(
  base: AssignmentBaseFields,
  counts: { snapshotCount: number; answeredCount: number },
): StudentAssignmentProgress {
  if (base.mode === "review") {
    const total = Math.max(0, base.max_questions ?? 0);
    return {
      answered: Math.min(counts.answeredCount, total || counts.answeredCount),
      total,
    };
  }
  const total = counts.snapshotCount;
  return {
    answered: Math.min(counts.answeredCount, total),
    total,
  };
}

function computeStatus(args: {
  lastCompletedAt: string | null;
  answeredCount: number;
}): StudentAssignmentStatus {
  if (args.lastCompletedAt) return "completed";
  if (args.answeredCount > 0) return "in_progress";
  return "not_started";
}

/**
 * Loads assignments targeted at the student.
 *
 * `fetchAssignmentList` internally uses the admin client for the
 * `assignments` query because its RLS policy (`assignments_read_scoped`)
 * gates SELECT on assignment_targets / created_by / admin, so late-joined
 * students would otherwise see an empty list silently.
 */
export async function getStudentAssignmentList(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<StudentAssignmentListResult> {
  return fetchAssignmentList(supabase, studentUserId);
}

/**
 * Deterministic 32-bit hash, used as a seed for per-student shuffle.
 */
function hashStringToInt(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministicShuffle<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashStringToInt(seed));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toQuestionPayload(raw: unknown): Question | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Question;
  if (!value.id || !value.text) return null;
  return value;
}

/**
 * Resolve review-mode questions dynamically for a single student.
 *
 * Flow:
 * 1. Load assignment review scope (topics + standards + maxQuestions).
 * 2. Load the student's incorrect attempts within scope.
 * 3. Look up the matching question payloads (from generated_questions, or
 *    fall back to matching assignment snapshots if present).
 * 4. Shuffle deterministically and cap at maxQuestions.
 */
export async function resolveReviewQuestionsForAssignment(
  admin: SupabaseClient,
  studentUserId: string,
  assignmentId: string,
): Promise<{ questions: Question[]; error: string | null }> {
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select(
      "id,mode,randomize_order,max_questions,review_topics,review_standards",
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError) {
    return { questions: [], error: assignmentError.message };
  }
  if (!assignment) {
    return { questions: [], error: "Assignment not found." };
  }
  if (assignment.mode !== "review") {
    return { questions: [], error: "Assignment is not in review mode." };
  }

  const topics: string[] = Array.isArray(assignment.review_topics)
    ? (assignment.review_topics as string[])
    : [];
  const standards: string[] = Array.isArray(assignment.review_standards)
    ? (assignment.review_standards as string[])
    : [];
  const maxQuestions =
    typeof assignment.max_questions === "number" && assignment.max_questions > 0
      ? assignment.max_questions
      : 10;

  const { data: allAttempts, error: allAttemptsError } = await admin
    .from("attempts")
    .select("question_id,topic,standard_id,is_correct,answered_at")
    .eq("user_id", studentUserId)
    .order("answered_at", { ascending: true });
  if (allAttemptsError) {
    return { questions: [], error: allAttemptsError.message };
  }

  const noFilter = topics.length === 0 && standards.length === 0;
  const topicsSet = new Set(topics);
  const standardsSet = new Set(standards);
  const wrongCountByQuestion = new Map<string, number>();
  for (const attempt of allAttempts ?? []) {
    const questionId = String(attempt.question_id);
    // OR semantic: a question matches the review scope when either its
    // standard_id matches a selected standard, or (fallback for legacy
    // attempts without a standard_id) its topic matches a selected topic.
    // The teacher UI only lets them pick standards; topics are derived from
    // the selected standards on submit to support legacy attempts.
    const standardMatch =
      standardsSet.size > 0 &&
      standardsSet.has(String(attempt.standard_id ?? ""));
    const topicMatch =
      topicsSet.size > 0 && topicsSet.has(String(attempt.topic ?? ""));
    const inScope = noFilter || standardMatch || topicMatch;
    if (!inScope) continue;
    incrementWrongCount(
      wrongCountByQuestion,
      questionId,
      Boolean(attempt.is_correct),
    );
  }

  const matchedQuestionIds = Array.from(wrongCountByQuestion.keys());

  if (matchedQuestionIds.length === 0) {
    return { questions: [], error: null };
  }

  const { data: generatedRows, error: generatedError } = await admin
    .from("generated_questions")
    .select("id,payload")
    .in("id", matchedQuestionIds);
  if (generatedError) {
    return { questions: [], error: generatedError.message };
  }
  const payloadById = new Map<string, Question>();
  for (const row of generatedRows ?? []) {
    const payload = toQuestionPayload(row.payload);
    if (payload) payloadById.set(String(row.id), payload);
  }

  const missingIds = matchedQuestionIds.filter((id) => !payloadById.has(id));
  if (missingIds.length > 0) {
    const { data: snapshotRows } = await admin
      .from("assignment_question_snapshots")
      .select("question_id,payload")
      .in("question_id", missingIds);
    for (const row of snapshotRows ?? []) {
      if (payloadById.has(String(row.question_id))) continue;
      const payload = toQuestionPayload(row.payload);
      if (payload) payloadById.set(String(row.question_id), payload);
    }
  }

  const candidates: Question[] = [];
  for (const id of matchedQuestionIds) {
    const payload = payloadById.get(id);
    if (payload) candidates.push(payload);
  }

  if (candidates.length === 0) {
    return { questions: [], error: null };
  }

  const shuffled = prioritizeQuestionsByWrongCount(candidates, wrongCountByQuestion, {
    shuffleWithinSameWrongCount: (bucket, wrongCount) =>
      deterministicShuffle(
        bucket,
        `${assignmentId}::${studentUserId}::review::${wrongCount}`,
      ),
  });
  return {
    questions: shuffled.slice(0, maxQuestions),
    error: null,
  };
}
