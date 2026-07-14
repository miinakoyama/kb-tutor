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
  /** null means unlimited retries; otherwise the cap set by the teacher. */
  max_attempts: number | null;
  /** Number of full runs the student has already completed (drives Attempt X/Y). */
  completed_attempts: number;
  /**
   * Count of real `assignment_completions` rows for this student. Unlike
   * `completed_attempts`, this is NOT synthesized from
   * `assignment_targets.last_completed_at`, so it is zero for legacy
   * pre-history-table completions. Use this (not `completed_attempts`)
   * when deciding whether the "Past attempts" history link should appear,
   * because the history endpoint can only surface rows from this table.
   */
  recorded_completion_count: number;
  status: StudentAssignmentStatus;
  last_completed_at: string | null;
  progress: StudentAssignmentProgress;
  /**
   * Accuracy of the most relevant run (0–100 integer), or null when the
   * student hasn't answered any questions yet (not_started).
   * - in_progress: correct / answered in the current run (latest attempt
   *   per question).
   * - completed:   correct / answered in the last completed run window.
   */
  accuracy: number | null;
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
  | "status"
  | "last_completed_at"
  | "progress"
  | "completed_attempts"
  | "recorded_completion_count"
  | "accuracy"
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
    max_attempts:
      typeof row.max_attempts === "number" && row.max_attempts > 0
        ? row.max_attempts
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
      "id,title,due_date,module_ids,topics,target_minutes,mode,randomize_order,max_questions,instructions,max_attempts,created_at",
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
    { data: completionRows, error: completionError },
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
      .select("assignment_id,question_id,selected_option_id,answered_at,is_correct")
      .eq("user_id", studentUserId)
      .in("assignment_id", orderedIds),
    admin
      .from("assignment_completions")
      .select("assignment_id,completed_at,attempt_number")
      .eq("student_user_id", studentUserId)
      .in("assignment_id", orderedIds)
      .order("attempt_number", { ascending: true }),
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
  if (completionError) {
    return { assignments: [], error: completionError.message };
  }

  const lastCompletedByAssignment = new Map<string, string | null>();
  for (const row of targetRows ?? []) {
    lastCompletedByAssignment.set(
      String(row.assignment_id),
      (row.last_completed_at as string | null | undefined) ?? null,
    );
  }

  const completedAttemptsByAssignment = new Map<string, number>();
  // Sorted ascending by attempt_number (guaranteed by the DB ORDER clause).
  const completionWindowsByAssignment = new Map<
    string,
    Array<{ completed_at: string }>
  >();
  for (const row of completionRows ?? []) {
    const id = String(row.assignment_id);
    completedAttemptsByAssignment.set(
      id,
      (completedAttemptsByAssignment.get(id) ?? 0) + 1,
    );
    if (!completionWindowsByAssignment.has(id)) {
      completionWindowsByAssignment.set(id, []);
    }
    completionWindowsByAssignment
      .get(id)!
      .push({ completed_at: String(row.completed_at) });
  }

  const snapshotCountByAssignment = new Map<string, number>();
  for (const row of snapshotRows ?? []) {
    const id = String(row.assignment_id);
    snapshotCountByAssignment.set(
      id,
      (snapshotCountByAssignment.get(id) ?? 0) + 1,
    );
  }

  // Build per-question "latest attempt" maps for two run windows:
  //   currentRunLatest  — attempts after last_completed_at  (in_progress accuracy)
  //   lastRunLatest     — attempts within the last completed run window (completed accuracy)
  // We also rebuild answeredQuestionsByAssignment here so we touch attemptRows only once.
  type LatestEntry = { isCorrect: boolean; answeredAt: number };
  const answeredQuestionsByAssignment = new Map<string, Set<string>>();
  const currentRunLatest = new Map<string, Map<string, LatestEntry>>();
  const lastRunLatest = new Map<string, Map<string, LatestEntry>>();

  for (const row of attemptRows ?? []) {
    const id = String(row.assignment_id);
    const lastCompletedAt = lastCompletedByAssignment.get(id) ?? null;
    const lastCompletedMs = lastCompletedAt
      ? new Date(lastCompletedAt).getTime()
      : -Infinity;

    const answeredAtStr = row.answered_at as string | null | undefined;
    if (!answeredAtStr) continue;
    const answeredAtMs = new Date(answeredAtStr).getTime();
    if (!Number.isFinite(answeredAtMs)) continue;

    const qid = String(row.question_id);
    // Short-answer rows in `attempts` are summary rows written only after every
    // part is resolved, so they count as completed assignment questions.
    const isCorrect = Boolean(row.is_correct);

    if (answeredAtMs > lastCompletedMs) {
      // Current (in-progress) run
      if (!answeredQuestionsByAssignment.has(id)) {
        answeredQuestionsByAssignment.set(id, new Set());
      }
      answeredQuestionsByAssignment.get(id)!.add(qid);

      if (!currentRunLatest.has(id)) currentRunLatest.set(id, new Map());
      const runMap = currentRunLatest.get(id)!;
      const prior = runMap.get(qid);
      if (!prior || answeredAtMs >= prior.answeredAt) {
        runMap.set(qid, { isCorrect, answeredAt: answeredAtMs });
      }
    } else if (lastCompletedAt) {
      // Potentially within the last completed run window: (prevCompleted, lastCompleted]
      const completions = completionWindowsByAssignment.get(id);
      const prevCompletedMs =
        completions && completions.length >= 2
          ? new Date(completions[completions.length - 2].completed_at).getTime()
          : -Infinity;

      if (answeredAtMs > prevCompletedMs) {
        if (!lastRunLatest.has(id)) lastRunLatest.set(id, new Map());
        const runMap = lastRunLatest.get(id)!;
        const prior = runMap.get(qid);
        if (!prior || answeredAtMs >= prior.answeredAt) {
          runMap.set(qid, { isCorrect, answeredAt: answeredAtMs });
        }
      }
    }
  }

  function computeAccuracy(
    latest: Map<string, LatestEntry> | undefined,
  ): number | null {
    if (!latest || latest.size === 0) return null;
    let correct = 0;
    for (const entry of latest.values()) {
      if (entry.isCorrect) correct += 1;
    }
    return Math.round((correct / latest.size) * 100);
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
      const recordedCount = completedAttemptsByAssignment.get(id) ?? 0;
      const accuracy =
        status === "in_progress"
          ? computeAccuracy(currentRunLatest.get(id))
          : status === "completed"
            ? computeAccuracy(lastRunLatest.get(id))
            : null;
      return {
        ...base,
        status,
        last_completed_at: lastCompletedAt,
        progress,
        accuracy,
        completed_attempts:
          recordedCount ||
          // Pre-history-table assignments may have a last_completed_at
          // without any rows in assignment_completions; treat that as one
          // completion so the count stays consistent with the badge.
          (lastCompletedAt ? 1 : 0),
        recorded_completion_count: recordedCount,
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
  // A completed assignment can later have a new run in progress. Attempts are
  // counted strictly after last_completed_at above, so answeredCount > 0 here
  // means "resume this newer run", not "old completed work".
  if (args.answeredCount > 0) return "in_progress";
  if (args.lastCompletedAt) return "completed";
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
 * Suggestion shown by the "Next" CTA on practice/exam summary screens.
 *
 * - `assignment` — there is at least one incomplete assignment for the student.
 *   The CTA links the student straight into that assignment's practice URL.
 * - `self_practice` — all of the student's assignments are done (or the
 *   student has no assignments at all). The CTA encourages Self Practice.
 *
 * Picked by {@link pickNextStudentAction}.
 */
export type NextStudentAction =
  | {
      type: "assignment";
      assignment: StudentAssignmentListItem;
    }
  | { type: "self_practice" };

interface PickNextActionOptions {
  /**
   * Assignment the student just finished. Excluded from candidates so the
   * CTA never suggests "next: the assignment you just finished" right after
   * its completion screen.
   */
  excludeAssignmentId?: string | null;
  /**
   * Wall clock used to decide overdue ordering. Defaults to `Date.now()`;
   * exposed for testability.
   */
  now?: Date;
}

/**
 * Decide what the student should do after finishing the current session.
 *
 * Ordering rules (highest priority first):
 *   1. Incomplete assignments are ranked by due date:
 *      - Already-overdue assignments come first (treated as most urgent).
 *      - Then the earliest non-past due date.
 *      - Then assignments without a due date.
 *      - Ties are broken by assignment id for determinism.
 *   2. If there are no incomplete assignments to suggest, fall back to
 *      Self Practice — the student should keep building reps anyway.
 *
 * This function is pure (no I/O, no `Date.now()`) so it's straightforward to
 * unit-test against fixed clocks.
 */
export function pickNextStudentAction(
  assignments: StudentAssignmentListItem[],
  options: PickNextActionOptions = {},
): NextStudentAction {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const excludeId = options.excludeAssignmentId?.trim() || null;

  const candidates = assignments.filter((a) => {
    if (a.status === "completed") return false;
    if (excludeId && a.id === excludeId) return false;
    return true;
  });

  if (candidates.length === 0) {
    return { type: "self_practice" };
  }

  const parseDue = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  type Bucket = "overdue" | "due" | "no_due";
  const bucketOf = (a: StudentAssignmentListItem): Bucket => {
    const ms = parseDue(a.due_date);
    if (ms === null) return "no_due";
    return ms < nowMs ? "overdue" : "due";
  };
  const bucketRank: Record<Bucket, number> = {
    overdue: 0,
    due: 1,
    no_due: 2,
  };

  // For overdue items, the MOST recently overdue (closest to now) is the
  // most actionable; deeply overdue items may be stale. For not-yet-due
  // items, the SOONEST due date is the most urgent. We model this by
  // sorting overdue descending, due-not-yet ascending — both expressed by
  // comparing absolute "distance from now".
  const sorted = [...candidates].sort((a, b) => {
    const bucketDiff = bucketRank[bucketOf(a)] - bucketRank[bucketOf(b)];
    if (bucketDiff !== 0) return bucketDiff;

    const aDue = parseDue(a.due_date);
    const bDue = parseDue(b.due_date);

    if (aDue !== null && bDue !== null) {
      // Same bucket here (we know bucketDiff === 0), so we only need to
      // inspect one side.
      if (bucketOf(a) === "overdue") {
        // Recently overdue first — that means the LARGER (closer to now)
        // timestamp wins.
        if (aDue !== bDue) return bDue - aDue;
      } else {
        // Soonest non-past due first — smaller timestamp wins.
        if (aDue !== bDue) return aDue - bDue;
      }
    } else if (aDue !== null) {
      // Shouldn't happen given equal buckets, but defensively keep dated
      // items ahead of undated ties.
      return -1;
    } else if (bDue !== null) {
      return 1;
    }

    return a.id.localeCompare(b.id);
  });

  return { type: "assignment", assignment: sorted[0] };
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
    .select("set_id,id,payload,content_version")
    .in("id", matchedQuestionIds);
  if (generatedError) {
    return { questions: [], error: generatedError.message };
  }
  const payloadById = new Map<string, Question>();
  for (const row of generatedRows ?? []) {
    const payload = toQuestionPayload(row.payload);
    if (payload) {
      payloadById.set(String(row.id), {
        ...payload,
        id: String(row.id),
        questionSetId:
          typeof row.set_id === "string" ? row.set_id : undefined,
        contentVersion:
          typeof row.content_version === "string"
            ? row.content_version
            : undefined,
      });
    }
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
