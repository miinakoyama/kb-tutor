import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const TTS_RATE_STORAGE_KEY = "kb-tutor-tts-rate";
const TTS_MIGRATION_KEY = "kb-tutor-tts-migrated-v1";
export const TTS_RATE_OPTIONS = [0.75, 1.0, 1.25] as const;
export const DEFAULT_TTS_RATE = 1.0;

export function isValidTtsRate(value: number): boolean {
  return TTS_RATE_OPTIONS.includes(value as (typeof TTS_RATE_OPTIONS)[number]);
}

export function getStoredTtsRate(fallback = DEFAULT_TTS_RATE): number {
  if (typeof window === "undefined") return fallback;

  try {
    const storedValue = Number(window.localStorage.getItem(TTS_RATE_STORAGE_KEY));
    if (isValidTtsRate(storedValue)) {
      return storedValue;
    }
  } catch {
    // localStorage may be unavailable in restricted environments
  }

  return fallback;
}

export function setStoredTtsRate(rate: number): void {
  if (typeof window === "undefined") return;
  if (!isValidTtsRate(rate)) return;

  try {
    window.localStorage.setItem(TTS_RATE_STORAGE_KEY, String(rate));
  } catch {
    // localStorage may be unavailable in restricted environments
  }

  void saveTtsRateToDb(rate);
}

function canUseRemoteDb(): boolean {
  return typeof window !== "undefined" && hasSupabaseEnv();
}

export async function saveTtsRateToDb(rate: number): Promise<void> {
  if (!isValidTtsRate(rate) || !canUseRemoteDb()) return;
  try {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("user_settings")
      .upsert({ tts_rate: rate }, { onConflict: "user_id" });
  } catch {
    // keep local fallback
  }
}

export async function syncTtsRateFromDb(
  fallback = DEFAULT_TTS_RATE,
): Promise<number> {
  if (!canUseRemoteDb()) return getStoredTtsRate(fallback);
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("user_settings")
      .select("tts_rate")
      .maybeSingle();
    const value = Number(data?.tts_rate);
    if (isValidTtsRate(value)) {
      setStoredTtsRate(value);
      return value;
    }
  } catch {
    // fallback
  }
  return getStoredTtsRate(fallback);
}

export async function migrateTtsRateOnce(): Promise<void> {
  if (!canUseRemoteDb() || typeof window === "undefined") return;
  if (window.localStorage.getItem(TTS_MIGRATION_KEY) === "1") return;
  const local = getStoredTtsRate(DEFAULT_TTS_RATE);
  await saveTtsRateToDb(local);
  window.localStorage.setItem(TTS_MIGRATION_KEY, "1");
}
