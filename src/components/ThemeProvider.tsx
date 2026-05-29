"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyResolvedThemeToDocument,
  DEFAULT_APPEARANCE_MODE,
  getSystemPrefersDark,
  normalizeAppearanceMode,
  resolveTheme,
  setStoredAppearanceMode,
  syncAppearanceFromDb,
  type AppearanceMode,
  type ResolvedTheme,
} from "@/lib/appearance-settings";

interface ThemeContextValue {
  appearanceMode: AppearanceMode;
  resolvedTheme: ResolvedTheme;
  setAppearanceMode: (mode: AppearanceMode) => void;
  syncAppearanceMode: (mode: AppearanceMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearanceMode, setAppearanceModeState] =
    useState<AppearanceMode>(DEFAULT_APPEARANCE_MODE);
  const [prefersDark, setPrefersDark] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const appearanceModeRef = useRef(appearanceMode);
  appearanceModeRef.current = appearanceMode;

  useEffect(() => {
    const init = async () => {
      const mode = await syncAppearanceFromDb();
      const prefers = getSystemPrefersDark();
      setAppearanceModeState(mode);
      setPrefersDark(prefers);
      applyResolvedThemeToDocument(resolveTheme(mode, prefers));
      setHydrated(true);
    };
    void init();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      const matches = event.matches;
      // Update .dark before children rerender so chart CSS variables match resolvedTheme.
      if (appearanceModeRef.current === "system") {
        applyResolvedThemeToDocument(matches ? "dark" : "light");
      }
      setPrefersDark(matches);
    };
    setPrefersDark(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [hydrated]);

  const resolvedTheme = useMemo(
    () => resolveTheme(appearanceMode, prefersDark),
    [appearanceMode, prefersDark],
  );

  useEffect(() => {
    if (!hydrated) return;
    applyResolvedThemeToDocument(resolvedTheme);
  }, [hydrated, resolvedTheme]);

  const setAppearanceMode = useCallback((mode: AppearanceMode) => {
    const normalized = normalizeAppearanceMode(mode);
    setAppearanceModeState(normalized);
    setStoredAppearanceMode(normalized);
    applyResolvedThemeToDocument(
      resolveTheme(normalized, getSystemPrefersDark()),
    );
  }, []);

  const syncAppearanceMode = useCallback((mode: AppearanceMode) => {
    const normalized = normalizeAppearanceMode(mode);
    setAppearanceModeState(normalized);
    applyResolvedThemeToDocument(
      resolveTheme(normalized, getSystemPrefersDark()),
    );
  }, []);

  const value = useMemo(
    () => ({
      appearanceMode,
      resolvedTheme,
      setAppearanceMode,
      syncAppearanceMode,
    }),
    [appearanceMode, resolvedTheme, setAppearanceMode, syncAppearanceMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
