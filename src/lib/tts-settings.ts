export const TTS_RATE_STORAGE_KEY = "kb-tutor-tts-rate";
export const TTS_RATE_OPTIONS = [0.75, 1.0, 1.25] as const;
export const DEFAULT_TTS_RATE = 1.0;

export function isValidTtsRate(value: number): boolean {
  return TTS_RATE_OPTIONS.includes(value as (typeof TTS_RATE_OPTIONS)[number]);
}

export function getStoredTtsRate(fallback = DEFAULT_TTS_RATE): number {
  if (typeof window === "undefined") return fallback;

  const storedValue = Number(window.localStorage.getItem(TTS_RATE_STORAGE_KEY));
  if (isValidTtsRate(storedValue)) {
    return storedValue;
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
}
