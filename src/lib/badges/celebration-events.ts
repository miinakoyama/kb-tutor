import type { EarnedBadgeSummary } from "@/types/badges";

const BADGES_EARNED_EVENT = "kb-tutor:badges-earned";

export function emitBadgesEarnedEvent(badges: EarnedBadgeSummary[]): void {
  if (typeof window === "undefined" || badges.length === 0) return;
  window.dispatchEvent(new CustomEvent<EarnedBadgeSummary[]>(BADGES_EARNED_EVENT, { detail: badges }));
}

export function subscribeToBadgesEarned(
  onEarned: (badges: EarnedBadgeSummary[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    onEarned((event as CustomEvent<EarnedBadgeSummary[]>).detail);
  };
  window.addEventListener(BADGES_EARNED_EVENT, listener);
  return () => {
    window.removeEventListener(BADGES_EARNED_EVENT, listener);
  };
}

/**
 * Fired at session end (exam results, practice/review summary) to surface
 * any badges newly earned during that session. Best-effort: the celebration
 * is a bonus, not a critical path, so failures are swallowed rather than
 * disrupting the results screen.
 */
export async function checkForNewlyEarnedBadges(): Promise<void> {
  try {
    const response = await fetch("/api/badges/sync", { method: "POST" });
    if (!response.ok) return;
    const body = (await response.json()) as { newlyEarned?: EarnedBadgeSummary[] };
    if (Array.isArray(body.newlyEarned) && body.newlyEarned.length > 0) {
      emitBadgesEarnedEvent(body.newlyEarned);
    }
  } catch {
    // best-effort only
  }
}
