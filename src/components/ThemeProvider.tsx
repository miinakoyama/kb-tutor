"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  applyResolvedThemeToDocument,
  DEFAULT_APPEARANCE_MODE,
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
  const [hydrated, setHydrated] = useState(false);

  // Resolve the stored/synced preference once on mount. The app never follows
  // the OS colour scheme, so there is no prefers-color-scheme listener.
  useEffect(() => {
    const init = async () => {
      const mode = await syncAppearanceFromDb();
      setAppearanceModeState(mode);
      applyResolvedThemeToDocument(resolveTheme(mode));
      setHydrated(true);
    };
    void init();
  }, []);

  const resolvedTheme = useMemo(
    () => resolveTheme(appearanceMode),
    [appearanceMode],
  );

  useEffect(() => {
    if (!hydrated) return;
    applyResolvedThemeToDocument(resolvedTheme);
  }, [hydrated, resolvedTheme]);

  const setAppearanceMode = useCallback((mode: AppearanceMode) => {
    const normalized = normalizeAppearanceMode(mode);
    setAppearanceModeState(normalized);
    setStoredAppearanceMode(normalized);
    applyResolvedThemeToDocument(resolveTheme(normalized));
  }, []);

  const syncAppearanceMode = useCallback((mode: AppearanceMode) => {
    const normalized = normalizeAppearanceMode(mode);
    setAppearanceModeState(normalized);
    applyResolvedThemeToDocument(resolveTheme(normalized));
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
