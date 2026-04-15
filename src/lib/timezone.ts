export const DEFAULT_APP_TIME_ZONE = "America/New_York";

export const COMMON_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "UTC",
] as const;

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(
  value: unknown,
  fallback = DEFAULT_APP_TIME_ZONE,
): string {
  return isValidTimeZone(value) ? value : fallback;
}

export function getBrowserTimeZone(
  fallback = DEFAULT_APP_TIME_ZONE,
): string {
  if (typeof window === "undefined") return fallback;
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return normalizeTimeZone(zone, fallback);
  } catch {
    return fallback;
  }
}
