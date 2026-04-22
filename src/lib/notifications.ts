import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_APP_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

export type StudentNotificationKind = "assignment_assigned" | "assignment_due_soon";

export interface StudentNotification {
  id: string;
  kind: StudentNotificationKind;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface StudentNotificationsResult {
  notifications: StudentNotification[];
  assignmentTargetCount: number;
  error: string | null;
}

type AssignmentRecord = {
  id: string;
  title: string;
  due_date?: string | null;
  // `assignments.created_at` is NOT NULL in the schema, so it is always
  // populated when the row is returned.
  created_at: string;
};

type AssignmentTargetRow = {
  assignment_id: string;
  // For assignments created *before* the student joined the school there is
  // no assignment_targets row, so we fall back to the assignment's own
  // created_at. `created_at` is therefore always populated here.
  created_at: string;
};

const DUE_SOON_WINDOW_HOURS = 48;

function formatDueDate(dueDate: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
    timeZone,
  }).format(new Date(dueDate));
}

function hoursUntil(dueDateIso: string, nowMs: number): number {
  const diffMs = new Date(dueDateIso).getTime() - nowMs;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
}

type TargetLoadResult = {
  targetRows: AssignmentTargetRow[];
  assignmentsById: Map<string, AssignmentRecord>;
  error: string | null;
};

async function loadTargetsAndAssignments(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<TargetLoadResult> {
  // Resolve assignments by school membership so students see every
  // assignment for their school, not just the ones that existed at
  // account-creation time. assignment_targets is only consulted for
  // per-student `created_at` overrides (the moment that specific student
  // was targeted).
  //
  // We *authenticate* the request through the auth-scoped client
  // (school_members RLS already restricts the student to their own
  // memberships), but we *read* assignments through the admin client
  // because the `assignments_read_scoped` RLS policy only allows SELECT
  // via assignment_targets (or created_by/admin). Without this split, a
  // late-joined student would get 0 assignment rows with no error, and
  // therefore no notifications.
  const { data: memberRowsData, error: memberRowsError } = await supabase
    .from("school_members")
    .select("school_id")
    .eq("student_user_id", studentUserId);
  if (memberRowsError) {
    return {
      targetRows: [],
      assignmentsById: new Map<string, AssignmentRecord>(),
      error: `Failed to load school memberships for notifications: ${memberRowsError.message}`,
    };
  }

  const schoolIds = Array.from(
    new Set((memberRowsData ?? []).map((row) => String(row.school_id))),
  );
  if (schoolIds.length === 0) {
    return {
      targetRows: [],
      assignmentsById: new Map<string, AssignmentRecord>(),
      error: null,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: assignmentsData, error: assignmentsError } = await admin
    .from("assignments")
    .select("id,title,due_date,created_at")
    .in("school_id", schoolIds);
  if (assignmentsError) {
    return {
      targetRows: [],
      assignmentsById: new Map<string, AssignmentRecord>(),
      error: `Failed to load assignments for notifications: ${assignmentsError.message}`,
    };
  }

  const assignmentRecords: AssignmentRecord[] = [];
  for (const row of (assignmentsData ?? []) as Array<Record<string, unknown>>) {
    const id = typeof row.id === "string" ? row.id : null;
    const createdAt =
      typeof row.created_at === "string" ? row.created_at : null;
    // `assignments.created_at` is NOT NULL in the schema, so a missing value
    // indicates an unexpected shape/RLS problem we should not silently paper
    // over with an epoch fallback (it would mis-order notifications as
    // "very old"). Surface it as an error instead.
    if (!id || !createdAt) {
      return {
        targetRows: [],
        assignmentsById: new Map<string, AssignmentRecord>(),
        error: "Unexpected assignment row shape: missing id or created_at.",
      };
    }
    assignmentRecords.push({
      id,
      title: typeof row.title === "string" ? row.title : "",
      due_date:
        typeof row.due_date === "string" ? row.due_date : null,
      created_at: createdAt,
    });
  }

  const assignmentIds = Array.from(
    new Set(assignmentRecords.map((row) => row.id)),
  );

  const assignmentsById = new Map<string, AssignmentRecord>(
    assignmentRecords.map((row) => [row.id, row]),
  );

  // If an assignment_targets row exists for this student, prefer its
  // created_at (per-student assignment time). Otherwise fall back to the
  // assignment's created_at so backfill for late-joined students still has
  // a sensible "assigned at" timestamp for the notification timeline.
  //
  // This must use the admin client: `assignment_targets_read_scoped` and
  // `assignments_read_scoped` reference each other via EXISTS() sub-
  // queries, which Postgres rejects as "infinite recursion detected in
  // policy for relation assignment_targets" for an authenticated student.
  let targetedAtByAssignment = new Map<string, string>();
  if (assignmentIds.length > 0) {
    const { data: targetRowsData, error: targetRowsError } = await admin
      .from("assignment_targets")
      .select("assignment_id,created_at")
      .eq("student_user_id", studentUserId)
      .in("assignment_id", assignmentIds);
    if (targetRowsError) {
      return {
        targetRows: [],
        assignmentsById: new Map<string, AssignmentRecord>(),
        error: `Failed to load assignment targets for notifications: ${targetRowsError.message}`,
      };
    }
    targetedAtByAssignment = new Map(
      ((targetRowsData ?? []) as Array<{ assignment_id: string; created_at: string }>).map(
        (row) => [String(row.assignment_id), String(row.created_at)],
      ),
    );
  }

  const targetRows: AssignmentTargetRow[] = assignmentRecords.map((row) => ({
    assignment_id: row.id,
    created_at: targetedAtByAssignment.get(row.id) ?? row.created_at,
  }));

  return {
    targetRows,
    assignmentsById,
    error: null,
  };
}

/**
 * Builds student-facing notifications from assignment data.
 *
 * Read state is derived from `lastReadAt` (typically
 * `user_settings.notifications_last_read_at`): any notification whose
 * `createdAt` is on or before that timestamp is considered read. If
 * `lastReadAt` is null/undefined the student has never opened the
 * notifications page, so every notification is unread.
 *
 * @param supabase Auth-scoped Supabase client.
 * @param studentUserId Current student's user/profile id.
 * @param options Optional runtime options such as display time zone and the
 *   last time the student viewed the notifications page.
 * @returns Notifications sorted by newest first plus assignment target count.
 */
export async function getStudentNotifications(
  supabase: SupabaseClient,
  studentUserId: string,
  options?: { timeZone?: string; lastReadAt?: string | null },
): Promise<StudentNotificationsResult> {
  const timeZone = normalizeTimeZone(options?.timeZone, DEFAULT_APP_TIME_ZONE);
  const lastReadAtMs = options?.lastReadAt
    ? new Date(options.lastReadAt).getTime()
    : null;
  const hasValidLastReadAt =
    lastReadAtMs !== null && Number.isFinite(lastReadAtMs);
  const loadResult = await loadTargetsAndAssignments(supabase, studentUserId);
  if (loadResult.error) {
    return {
      notifications: [],
      assignmentTargetCount: 0,
      error: loadResult.error,
    };
  }

  const rows = loadResult.targetRows;
  const nowMs = Date.now();
  const dueSoonWindowMs = DUE_SOON_WINDOW_HOURS * 60 * 60 * 1000;

  const isRead = (createdAtIso: string): boolean => {
    if (!hasValidLastReadAt) return false;
    return new Date(createdAtIso).getTime() <= (lastReadAtMs as number);
  };

  const notifications: StudentNotification[] = [];

  for (const row of rows) {
    const assignment = loadResult.assignmentsById.get(row.assignment_id);
    if (!assignment) continue;

    const assignedAtMs = new Date(row.created_at).getTime();
    const dueText = assignment.due_date
      ? ` Due ${formatDueDate(assignment.due_date, timeZone)}.`
      : "";

    notifications.push({
      id: `assigned-${row.assignment_id}`,
      kind: "assignment_assigned",
      message: `Your teacher assigned "${assignment.title}".${dueText}`,
      createdAt: row.created_at,
      read: isRead(row.created_at),
    });

    if (!assignment.due_date) continue;

    const dueMs = new Date(assignment.due_date).getTime();
    const isFutureDue = dueMs > nowMs;
    const isDueSoon = dueMs - nowMs <= dueSoonWindowMs;
    if (!isFutureDue || !isDueSoon) continue;

    const remainingHours = hoursUntil(assignment.due_date, nowMs);
    // The "due soon" notification logically exists from the moment the
    // assignment entered the 48-hour window, but it could not have been
    // visible to the student before the assignment itself was created.
    // Clamp to assignedAtMs so a student who last visited notifications
    // *after* (dueMs - window) but *before* the assignment was created
    // still sees it as unread.
    const dueSoonCreatedAtMs = Math.max(dueMs - dueSoonWindowMs, assignedAtMs);
    const dueSoonCreatedAt = new Date(dueSoonCreatedAtMs).toISOString();

    notifications.push({
      id: `due-soon-${row.assignment_id}`,
      kind: "assignment_due_soon",
      message: `"${assignment.title}" is due in about ${remainingHours} hour${
        remainingHours === 1 ? "" : "s"
      }.`,
      createdAt: dueSoonCreatedAt,
      read: isRead(dueSoonCreatedAt),
    });
  }

  return {
    notifications: notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    assignmentTargetCount: rows.length,
    error: null,
  };
}
