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

  it("does not overwrite local light/dark with migration default system", async () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    maybeSingleMock.mockResolvedValue({ data: { appearance_mode: "system" } });

    await expect(syncAppearanceFromDb()).resolves.toBe("dark");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
  });

  it("accepts DB system when local preference is also system", async () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "system");
    maybeSingleMock.mockResolvedValue({ data: { appearance_mode: "system" } });

    await expect(syncAppearanceFromDb()).resolves.toBe("system");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("system");
  });
});
