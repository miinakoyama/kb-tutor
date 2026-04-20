import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const ONBOARDING_STORAGE_PREFIX = "kb-tutor-onboarding-complete";

function canUseRemoteDb(): boolean {
  return typeof window !== "undefined" && hasSupabaseEnv();
}

function getStorageKey(userId: string): string {
  return `${ONBOARDING_STORAGE_PREFIX}:${userId}`;
}

function getFallbackUserId(userId?: string): string {
  return userId && userId.length > 0 ? userId : "anonymous";
}

export function isOnboardingCompletedLocally(userId?: string): boolean {
  if (typeof window === "undefined") return false;
  const key = getStorageKey(getFallbackUserId(userId));
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setOnboardingCompletedLocally(userId?: string): void {
  if (typeof window === "undefined") return;
  const key = getStorageKey(getFallbackUserId(userId));
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // localStorage may be unavailable in restricted environments
  }
}

export async function syncOnboardingCompletion(userId?: string): Promise<boolean> {
  const fallback = isOnboardingCompletedLocally(userId);
  if (!canUseRemoteDb()) return fallback;

  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("user_settings")
      .select("onboarding_completed_at")
      .maybeSingle();

    const completed = Boolean(data?.onboarding_completed_at) || fallback;
    if (completed) {
      setOnboardingCompletedLocally(userId);
    }
    return completed;
  } catch {
    return fallback;
  }
}

export async function markOnboardingCompleted(userId?: string): Promise<void> {
  setOnboardingCompletedLocally(userId);

  if (!canUseRemoteDb()) return;

  try {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("user_settings")
      .upsert(
        { onboarding_completed_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    // keep local fallback
  }
}
