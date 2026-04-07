"use client";

export const AUTO_READ_FEEDBACK_KEY = "kb-tutor-auto-read-feedback";
export const DEFAULT_SESSION_MINUTES_KEY = "kb-tutor-default-session-minutes";

export function getStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function setStoredBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value ? "true" : "false");
}

export function getStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function setStoredNumber(key: string, value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}
