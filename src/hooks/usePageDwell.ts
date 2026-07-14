"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Records how long the user actually looks at a page, as small heartbeat
 * rows in `page_dwell_events` (consumed by the homepage Learning effort
 * chart).
 *
 * Only *visible* time counts — the clock pauses whenever the tab is hidden.
 * Accumulated time is flushed every 30s, on tab-hide, and on unmount, so a
 * killed tab loses at most the last partial interval. This is deliberately
 * NOT the `useAnalyticsSession` model (one row bracketed by an exit beacon):
 * that design loses the entire session when the exit write never happens.
 *
 * Each row is capped at the table's CHECK bound; anything beyond it (e.g. a
 * laptop waking from sleep with the page "visible") is discarded rather
 * than recorded as study time.
 */

const FLUSH_INTERVAL_MS = 30_000;
/** Must match the CHECK constraint on page_dwell_events.seconds. */
const MAX_ROW_SECONDS = 120;

export function usePageDwell(page: string, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    const supabase = getSupabaseBrowserClient();
    let visibleSince: number | null =
      document.visibilityState === "visible" ? Date.now() : null;
    let accumulatedMs = 0;

    const settle = () => {
      if (visibleSince !== null) {
        accumulatedMs += Date.now() - visibleSince;
        visibleSince = Date.now();
      }
    };

    const flush = () => {
      settle();
      const seconds = Math.floor(accumulatedMs / 1000);
      if (seconds < 1) return;
      accumulatedMs -= seconds * 1000;
      void supabase
        .from("page_dwell_events")
        .insert({ page, seconds: Math.min(seconds, MAX_ROW_SECONDS) })
        .then(({ error }) => {
          if (error && process.env.NODE_ENV !== "production") {
            console.warn("[usePageDwell] insert failed:", error.message);
          }
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        settle();
        visibleSince = null;
        flush();
      } else {
        visibleSince = Date.now();
      }
    };

    const interval = window.setInterval(flush, FLUSH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [page, enabled]);
}
