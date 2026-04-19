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
  const { data: targetRowsData, error: targetRowsError } = await supabase
    .from("assignment_targets")
    .select("assignment_id,created_at")
    .eq("student_user_id", studentUserId);
  if (targetRowsError) {
    return {
      targetRows: [],
      assignmentsById: new Map<string, AssignmentRecord>(),
      error: `Failed to load assignment targets for notifications: ${targetRowsError.message}`,
    };
  }

  const targetRows = (targetRowsData ?? []) as AssignmentTargetRow[];
  const assignmentIds = Array.from(new Set(targetRows.map((row) => row.assignment_id)));
  if (assignmentIds.length === 0) {
    return {
      targetRows,
      assignmentsById: new Map<string, AssignmentRecord>(),
      error: null,
    };
  }

  const { data: assignmentsData, error: assignmentsError } = await supabase
    .from("assignments")
    .select("id,title,due_date")
    .in("id", assignmentIds);
  if (assignmentsError) {
    return {
      targetRows: [],
      assignmentsById: new Map<string, AssignmentRecord>(),
      error: `Failed to load assignments for notifications: ${assignmentsError.message}`,
    };
  }

  const assignmentsById = new Map<string, AssignmentRecord>(
    ((assignmentsData ?? []) as AssignmentRecord[]).map((row) => [row.id, row]),
  );

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
    // Anchor the "due soon" notification at the moment the assignment
    // entered the 48-hour window so its read state behaves intuitively
    // relative to the student's last notifications visit.
    const dueSoonCreatedAt = new Date(dueMs - dueSoonWindowMs).toISOString();

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
