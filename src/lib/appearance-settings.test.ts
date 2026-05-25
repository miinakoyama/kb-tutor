import { beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_MODE,
  getStoredAppearanceMode,
  normalizeAppearanceMode,
  resolveTheme,
} from "@/lib/appearance-settings";

describe("normalizeAppearanceMode", () => {
  it("returns valid modes unchanged", () => {
    expect(normalizeAppearanceMode("system")).toBe("system");
    expect(normalizeAppearanceMode("light")).toBe("light");
    expect(normalizeAppearanceMode("dark")).toBe("dark");
  });

  it("returns default for invalid values", () => {
    expect(normalizeAppearanceMode(null)).toBe(DEFAULT_APPEARANCE_MODE);
    expect(normalizeAppearanceMode("invalid")).toBe(DEFAULT_APPEARANCE_MODE);
    expect(normalizeAppearanceMode("", "light")).toBe("light");
  });
});

describe("resolveTheme", () => {
  it("forces light and dark modes", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows system preference when mode is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("getStoredAppearanceMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns default when storage is empty", () => {
    expect(getStoredAppearanceMode()).toBe(DEFAULT_APPEARANCE_MODE);
  });

  it("reads stored mode from localStorage", () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    expect(getStoredAppearanceMode()).toBe("dark");
  });

  it("falls back when stored value is invalid", () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "purple");
    expect(getStoredAppearanceMode()).toBe(DEFAULT_APPEARANCE_MODE);
  });
});
