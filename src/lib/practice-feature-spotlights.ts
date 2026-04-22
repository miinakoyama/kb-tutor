const STORAGE_VERSION = "v1";

export type PracticeFeatureSpotlightKind =
  | "readAloud"
  | "glossarySide"
  | "glossaryInline";

function fallbackUserId(userId: string | null | undefined): string {
  return userId && userId.length > 0 ? userId : "anonymous";
}

function storageKey(kind: PracticeFeatureSpotlightKind, userId: string | null | undefined): string {
  return `kb-tutor-spotlight-${kind}:${STORAGE_VERSION}:${fallbackUserId(userId)}`;
}

export function isPracticeFeatureSpotlightDone(
  userId: string | null | undefined,
  kind: PracticeFeatureSpotlightKind,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(kind, userId)) === "1";
  } catch {
    return false;
  }
}

export function markPracticeFeatureSpotlightDone(
  userId: string | null | undefined,
  kind: PracticeFeatureSpotlightKind,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(kind, userId), "1");
  } catch {
    // localStorage may be unavailable
  }
}
