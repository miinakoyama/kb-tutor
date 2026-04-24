const ALL_ASSIGNMENTS_COMPLETED_EVENT = "kb-tutor:all-assignments-completed";
const INCOMPLETE_COUNT_KEY_PREFIX = "kb-tutor-assignment-incomplete-count-v1";

function keyForUser(userId: string): string {
  return `${INCOMPLETE_COUNT_KEY_PREFIX}:${userId}`;
}

export function emitAllAssignmentsCompletedEvent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ALL_ASSIGNMENTS_COMPLETED_EVENT));
}

export function subscribeToAllAssignmentsCompleted(
  onCompleted: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => onCompleted();
  window.addEventListener(ALL_ASSIGNMENTS_COMPLETED_EVENT, listener);
  return () => {
    window.removeEventListener(ALL_ASSIGNMENTS_COMPLETED_EVENT, listener);
  };
}

export function readStoredIncompleteAssignmentCount(userId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyForUser(userId));
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredIncompleteAssignmentCount(
  userId: string,
  incompleteCount: number,
): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(incompleteCount) || incompleteCount < 0) return;
  try {
    window.localStorage.setItem(keyForUser(userId), String(incompleteCount));
  } catch {
    // ignore quota / private mode
  }
}
