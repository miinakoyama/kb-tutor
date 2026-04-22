import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// hasSupabaseEnv() is the only thing we need to mock to make the getters
// / setters purely localStorage-backed in tests.
vi.mock("@/lib/supabase/env", () => ({
  hasSupabaseEnv: () => false,
  getSupabaseUrl: () => "",
  getSupabaseAnonKey: () => "",
  getSupabaseServiceRoleKey: () => "",
}));

import {
  DEFAULT_TTS_RATE,
  TTS_RATE_OPTIONS,
  TTS_RATE_STORAGE_KEY,
  getStoredTtsRate,
  isValidTtsRate,
  setStoredTtsRate,
} from "@/lib/tts-settings";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("isValidTtsRate", () => {
  it("accepts every rate in TTS_RATE_OPTIONS", () => {
    for (const rate of TTS_RATE_OPTIONS) {
      expect(isValidTtsRate(rate)).toBe(true);
    }
  });

  it("rejects other numbers", () => {
    expect(isValidTtsRate(0.5)).toBe(false);
    expect(isValidTtsRate(2)).toBe(false);
    expect(isValidTtsRate(Number.NaN)).toBe(false);
  });
});

describe("getStoredTtsRate", () => {
  it("returns the default when no value is stored", () => {
    expect(getStoredTtsRate()).toBe(DEFAULT_TTS_RATE);
  });

  it("returns a valid stored value", () => {
    localStorage.setItem(TTS_RATE_STORAGE_KEY, "1.25");
    expect(getStoredTtsRate()).toBe(1.25);
  });

  it("falls back to the default when the stored value is invalid", () => {
    localStorage.setItem(TTS_RATE_STORAGE_KEY, "0.5");
    expect(getStoredTtsRate()).toBe(DEFAULT_TTS_RATE);
  });

  it("respects a custom fallback", () => {
    expect(getStoredTtsRate(0.75)).toBe(0.75);
  });
});

describe("setStoredTtsRate", () => {
  it("persists a valid rate", () => {
    setStoredTtsRate(1.25);
    expect(localStorage.getItem(TTS_RATE_STORAGE_KEY)).toBe("1.25");
  });

  it("ignores invalid rates", () => {
    setStoredTtsRate(0.5);
    expect(localStorage.getItem(TTS_RATE_STORAGE_KEY)).toBeNull();
  });
});
