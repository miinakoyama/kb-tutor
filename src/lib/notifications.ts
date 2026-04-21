import type { SupabaseClient } from "@supabase/supabase-js";
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

  const { data: assignmentsData, error: assignmentsError } = await supabase
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

  const assignmentIds = Array.from(
    new Set(((assignmentsData ?? []) as Array<{ id: string }>).map((row) => row.id)),
  );

  const assignmentsById = new Map<string, AssignmentRecord>(
    ((assignmentsData ?? []) as AssignmentRecord[]).map((row) => [row.id, row]),
  );

  // If an assignment_targets row exists for this student, prefer its
  // created_at (per-student assignment time). Otherwise fall back to the
  // assignment's created_at so backfill for late-joined students still has
  // a sensible "assigned at" timestamp for the notification timeline.
  let targetedAtByAssignment = new Map<string, string>();
  if (assignmentIds.length > 0) {
    const { data: targetRowsData, error: targetRowsError } = await supabase
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

  const targetRows: AssignmentTargetRow[] = (
    (assignmentsData ?? []) as Array<{ id: string; created_at?: string | null }>
  ).map((row) => ({
    assignment_id: row.id,
    created_at:
      targetedAtByAssignment.get(row.id) ??
      (row.created_at ? String(row.created_at) : new Date(0).toISOString()),
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
  let loadResult = await loadTargetsAndAssignments(supabase, studentUserId);
  let errorMessage: string | null = loadResult.error;

  // Fallback for environments where RLS policy migrations are not yet applied.
  if (loadResult.error) {
    try {
      const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
      const adminClient = createSupabaseAdminClient();
      const adminResult = await loadTargetsAndAssignments(adminClient, studentUserId);
      if (!adminResult.error) {
        loadResult = adminResult;
        errorMessage = null;
      } else {
        errorMessage = adminResult.error;
      }
    } catch {
      // keep original load error
    }
  }

  if (loadResult.error) {
    return {
      notifications: [],
      assignmentTargetCount: 0,
      error: errorMessage ?? loadResult.error,
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
