import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const TOUR_STORAGE_PREFIX = "kb-tutor-sa-tour-seen";

function canUseRemoteDb(): boolean {
  return typeof window !== "undefined" && hasSupabaseEnv();
}

function getStorageKey(userId?: string): string {
  return `${TOUR_STORAGE_PREFIX}:${userId && userId.length > 0 ? userId : "anonymous"}`;
}

export function isShortAnswerTourSeenLocally(userId?: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(getStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function setShortAnswerTourSeenLocally(userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getStorageKey(userId), "1");
  } catch {
    // localStorage may be unavailable in restricted environments
  }
}

/** Returns whether the student has already seen the short-answer tour. */
export async function syncShortAnswerTourSeen(userId?: string): Promise<boolean> {
  const fallback = isShortAnswerTourSeenLocally(userId);
  if (!canUseRemoteDb()) return fallback;

  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("user_settings")
      .select("short_answer_tour_seen_at")
      .maybeSingle();

    const seen = Boolean(data?.short_answer_tour_seen_at) || fallback;
    if (seen) setShortAnswerTourSeenLocally(userId);
    return seen;
  } catch {
    return fallback;
  }
}

export async function markShortAnswerTourSeen(userId?: string): Promise<void> {
  setShortAnswerTourSeenLocally(userId);
  if (!canUseRemoteDb()) return;

  try {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("user_settings")
      .upsert(
        { short_answer_tour_seen_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    // keep local fallback
  }
}
