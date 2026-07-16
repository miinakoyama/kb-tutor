export interface SortableShortAnswerAttempt {
  attemptId: string;
  studentLabel: string;
  partLabel: string;
  attemptNumber: number;
  answeredAt: string;
}

function compareAnsweredAt(a: string, b: string): number {
  const aTime = Date.parse(a);
  const bTime = Date.parse(b);
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
    return aTime - bTime;
  }
  return a.localeCompare(b);
}

/**
 * Keeps each student's part attempts chronological across repeated runs.
 * Attempt numbers restart for every run, so they cannot be the primary order.
 */
export function compareShortAnswerAttempts(
  a: SortableShortAnswerAttempt,
  b: SortableShortAnswerAttempt,
): number {
  return (
    a.studentLabel.localeCompare(b.studentLabel) ||
    a.partLabel.localeCompare(b.partLabel) ||
    compareAnsweredAt(a.answeredAt, b.answeredAt) ||
    a.attemptNumber - b.attemptNumber ||
    a.attemptId.localeCompare(b.attemptId)
  );
}

export function formatShortAnswerAttemptTimestamp(answeredAt: string): string {
  const date = new Date(answeredAt);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
