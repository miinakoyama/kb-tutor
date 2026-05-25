import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type AppearanceMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";
export const APPEARANCE_STORAGE_KEY = "kb-tutor-appearance-mode";
const APPEARANCE_MIGRATION_KEY = "kb-tutor-appearance-migrated-v1";

const VALID_MODES: AppearanceMode[] = ["system", "light", "dark"];

function canUseRemoteDb(): boolean {
  return typeof window !== "undefined" && hasSupabaseEnv();
}

export function normalizeAppearanceMode(
  value: unknown,
  fallback: AppearanceMode = DEFAULT_APPEARANCE_MODE,
): AppearanceMode {
  if (typeof value === "string" && VALID_MODES.includes(value as AppearanceMode)) {
    return value as AppearanceMode;
  }
  return fallback;
}

export function resolveTheme(
  mode: AppearanceMode,
  prefersDark: boolean,
): ResolvedTheme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return prefersDark ? "dark" : "light";
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function setStoredAppearanceModeLocalOnly(mode: AppearanceMode): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeAppearanceMode(mode);
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, normalized);
  } catch {
    // localStorage may be unavailable in restricted environments
  }
}

export function getStoredAppearanceMode(
  fallback: AppearanceMode = DEFAULT_APPEARANCE_MODE,
): AppearanceMode {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return normalizeAppearanceMode(raw, fallback);
  } catch {
    return fallback;
  }
}

export function setStoredAppearanceMode(mode: AppearanceMode): void {
  const normalized = normalizeAppearanceMode(mode);
  setStoredAppearanceModeLocalOnly(normalized);
  void saveAppearanceModeToDb(normalized);
}

export async function saveAppearanceModeToDb(
  mode: AppearanceMode,
): Promise<void> {
  if (!canUseRemoteDb()) return;
  const normalized = normalizeAppearanceMode(mode);
  try {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("user_settings")
      .upsert({ appearance_mode: normalized }, { onConflict: "user_id" });
  } catch {
    // keep local fallback
  }
}

export async function syncAppearanceFromDb(
  fallback: AppearanceMode = DEFAULT_APPEARANCE_MODE,
): Promise<AppearanceMode> {
  if (!canUseRemoteDb()) return getStoredAppearanceMode(fallback);
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("user_settings")
      .select("appearance_mode")
      .maybeSingle();
    const normalized = normalizeAppearanceMode(data?.appearance_mode, fallback);
    setStoredAppearanceModeLocalOnly(normalized);
    return normalized;
  } catch {
    return getStoredAppearanceMode(fallback);
  }
}

export async function migrateAppearanceOnce(): Promise<void> {
  if (!canUseRemoteDb() || typeof window === "undefined") return;
  if (window.localStorage.getItem(APPEARANCE_MIGRATION_KEY) === "1") return;

  const hadLocalPreference =
    window.localStorage.getItem(APPEARANCE_STORAGE_KEY) !== null;

  if (hadLocalPreference) {
    await saveAppearanceModeToDb(getStoredAppearanceMode());
  } else {
    await syncAppearanceFromDb();
  }

  window.localStorage.setItem(APPEARANCE_MIGRATION_KEY, "1");
}

export function applyResolvedThemeToDocument(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}
