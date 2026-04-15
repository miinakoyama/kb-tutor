import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DEFAULT_APP_TIME_ZONE,
  getBrowserTimeZone,
  normalizeTimeZone,
} from "@/lib/timezone";

export const TIME_ZONE_STORAGE_KEY = "kb-tutor-time-zone";
const TIME_ZONE_MIGRATION_KEY = "kb-tutor-time-zone-migrated-v1";

function canUseRemoteDb(): boolean {
  return typeof window !== "undefined" && hasSupabaseEnv();
}

function setStoredTimeZoneLocalOnly(timeZone: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeTimeZone(timeZone, DEFAULT_APP_TIME_ZONE);
  try {
    window.localStorage.setItem(TIME_ZONE_STORAGE_KEY, normalized);
  } catch {
    // localStorage may be unavailable in restricted environments
  }
}

export function getStoredTimeZone(
  fallback = getBrowserTimeZone(DEFAULT_APP_TIME_ZONE),
): string {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(TIME_ZONE_STORAGE_KEY);
    return normalizeTimeZone(raw, fallback);
  } catch {
    return fallback;
  }
}

export function setStoredTimeZone(timeZone: string): void {
  const normalized = normalizeTimeZone(timeZone, DEFAULT_APP_TIME_ZONE);
  setStoredTimeZoneLocalOnly(normalized);
  void saveTimeZoneToDb(normalized);
}

export async function saveTimeZoneToDb(timeZone: string): Promise<void> {
  if (!canUseRemoteDb()) return;
  const normalized = normalizeTimeZone(timeZone, DEFAULT_APP_TIME_ZONE);
  try {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("user_settings")
      .upsert({ time_zone: normalized }, { onConflict: "user_id" });
  } catch {
    // keep local fallback
  }
}

export async function syncTimeZoneFromDb(
  fallback = getBrowserTimeZone(DEFAULT_APP_TIME_ZONE),
): Promise<string> {
  if (!canUseRemoteDb()) return getStoredTimeZone(fallback);
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("user_settings")
      .select("time_zone")
      .maybeSingle();
    const normalized = normalizeTimeZone(data?.time_zone, fallback);
    setStoredTimeZoneLocalOnly(normalized);
    return normalized;
  } catch {
    return getStoredTimeZone(fallback);
  }
}

export async function migrateTimeZoneOnce(): Promise<void> {
  if (!canUseRemoteDb() || typeof window === "undefined") return;
  if (window.localStorage.getItem(TIME_ZONE_MIGRATION_KEY) === "1") return;
  const local = getStoredTimeZone(getBrowserTimeZone(DEFAULT_APP_TIME_ZONE));
  await saveTimeZoneToDb(local);
  window.localStorage.setItem(TIME_ZONE_MIGRATION_KEY, "1");
}
