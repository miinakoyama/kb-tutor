/**
 * localStorage key: once the student dismisses the "all assignments complete"
 * Self Practice nudge modal, we do not show it again on the assignments page
 * load (until they clear site data).
 */
export const ALL_ASSIGNMENTS_COMPLETE_NUDGE_DISMISSED_KEY =
  "kb-tutor-all-assignments-complete-self-practice-nudge-dismissed-v1";

export function readAllAssignmentsCompleteNudgeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ALL_ASSIGNMENTS_COMPLETE_NUDGE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissAllAssignmentsCompleteNudge(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ALL_ASSIGNMENTS_COMPLETE_NUDGE_DISMISSED_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}
