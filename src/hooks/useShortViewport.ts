"use client";

import { useSyncExternalStore } from "react";

/**
 * Matches viewports too short to show the full-size question layout
 * (laptops with browser chrome, tablets, phones). Keep in sync with the
 * `short` custom variant in src/app/globals.css.
 */
export const SHORT_VIEWPORT_QUERY = "(max-height: 864px)";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mediaQuery = window.matchMedia(SHORT_VIEWPORT_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(SHORT_VIEWPORT_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * True when the viewport is short enough that question screens should use
 * their compact layout so the whole question fits without scrolling.
 */
export function useShortViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
