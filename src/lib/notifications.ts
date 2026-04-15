import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentNotificationKind = "assignment_assigned" | "assignment_due_soon";

export interface StudentNotification {
  id: string;
  kind: StudentNotificationKind;
  message: string;
  createdAt: string;
  read: boolean;
}

type AssignmentRecord = {
  id: string;
  title: string;
  due_date?: string | null;
};

type AssignmentTargetRow = {
  assignment_id: string;
  created_at: string;
  assignments: AssignmentRecord | AssignmentRecord[] | null;
};

const DUE_SOON_WINDOW_HOURS = 48;
const UNREAD_RECENT_HOURS = 24;
export const STUDENT_TIME_ZONE = "America/New_York";

function formatDueDate(dueDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
    timeZone: STUDENT_TIME_ZONE,
  }).format(new Date(dueDate));
}

function hoursUntil(dueDateIso: string, nowMs: number): number {
  const diffMs = new Date(dueDateIso).getTime() - nowMs;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
}

export async function getStudentNotifications(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<StudentNotification[]> {
  const { data: targetRows } = await supabase
    .from("assignment_targets")
    .select("assignment_id,created_at,assignments(id,title,due_date)")
    .eq("student_user_id", studentUserId);

  const rows = (targetRows ?? []) as AssignmentTargetRow[];
  const nowMs = Date.now();
  const dueSoonWindowMs = DUE_SOON_WINDOW_HOURS * 60 * 60 * 1000;
  const unreadRecentWindowMs = UNREAD_RECENT_HOURS * 60 * 60 * 1000;

  const notifications: StudentNotification[] = [];

  for (const row of rows) {
    const relation = row.assignments;
    const assignment = Array.isArray(relation) ? relation[0] : relation;
    if (!assignment) continue;

    const assignedAtMs = new Date(row.created_at).getTime();
    const assignedRead = nowMs - assignedAtMs > unreadRecentWindowMs;
    const dueText = assignment.due_date
      ? ` Due ${formatDueDate(assignment.due_date)}.`
      : "";

    notifications.push({
      id: `assigned-${row.assignment_id}`,
      kind: "assignment_assigned",
      message: `Your teacher assigned "${assignment.title}".${dueText}`,
      createdAt: row.created_at,
      read: assignedRead,
    });

    if (!assignment.due_date) continue;

    const dueMs = new Date(assignment.due_date).getTime();
    const isFutureDue = dueMs > nowMs;
    const isDueSoon = dueMs - nowMs <= dueSoonWindowMs;
    if (!isFutureDue || !isDueSoon) continue;

    const remainingHours = hoursUntil(assignment.due_date, nowMs);
    const dueSoonCreatedAt = new Date(
      Math.max(nowMs - unreadRecentWindowMs, dueMs - unreadRecentWindowMs),
    ).toISOString();

    notifications.push({
      id: `due-soon-${row.assignment_id}`,
      kind: "assignment_due_soon",
      message: `"${assignment.title}" is due in about ${remainingHours} hour${
        remainingHours === 1 ? "" : "s"
      }.`,
      createdAt: dueSoonCreatedAt,
      read: remainingHours > UNREAD_RECENT_HOURS,
    });
  }

  return notifications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
