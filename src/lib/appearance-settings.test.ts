import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_MODE,
  getStoredAppearanceMode,
  normalizeAppearanceMode,
  resolveTheme,
  syncAppearanceFromDb,
} from "@/lib/appearance-settings";

const maybeSingleMock = vi.fn();

vi.mock("@/lib/supabase/env", () => ({
  hasSupabaseEnv: () => true,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    from: () => ({
      select: () => ({
        maybeSingle: maybeSingleMock,
      }),
    }),
  }),
}));

describe("normalizeAppearanceMode", () => {
  it("returns valid modes unchanged", () => {
    expect(normalizeAppearanceMode("light")).toBe("light");
    expect(normalizeAppearanceMode("dark")).toBe("dark");
  });

  it("maps the removed legacy 'system' value back to the light default", () => {
    expect(normalizeAppearanceMode("system")).toBe(DEFAULT_APPEARANCE_MODE);
    expect(DEFAULT_APPEARANCE_MODE).toBe("light");
  });

  it("returns default for invalid values", () => {
    expect(normalizeAppearanceMode(null)).toBe(DEFAULT_APPEARANCE_MODE);
    expect(normalizeAppearanceMode("invalid")).toBe(DEFAULT_APPEARANCE_MODE);
    expect(normalizeAppearanceMode("", "light")).toBe("light");
  });
});

describe("resolveTheme", () => {
  it("is dark only when the mode is dark; everything else is light", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
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

describe("syncAppearanceFromDb", () => {
  beforeEach(() => {
    window.localStorage.clear();
    maybeSingleMock.mockReset();
  });

  it("preserves local preference when DB appearance_mode is missing", async () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    maybeSingleMock.mockResolvedValue({ data: null });

    await expect(syncAppearanceFromDb()).resolves.toBe("dark");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
  });

  it("syncs local storage when DB has a valid appearance_mode", async () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "light");
    maybeSingleMock.mockResolvedValue({ data: { appearance_mode: "dark" } });

    await expect(syncAppearanceFromDb()).resolves.toBe("dark");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
  });

  it("ignores a legacy DB 'system' value and keeps the local preference", async () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    maybeSingleMock.mockResolvedValue({ data: { appearance_mode: "system" } });

    await expect(syncAppearanceFromDb()).resolves.toBe("dark");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
  });

  it("falls back to the light default when only a legacy 'system' value exists", async () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "system");
    maybeSingleMock.mockResolvedValue({ data: { appearance_mode: "system" } });

    await expect(syncAppearanceFromDb()).resolves.toBe("light");
  });
});
