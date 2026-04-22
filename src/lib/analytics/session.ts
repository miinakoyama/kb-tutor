"use client";

import { useEffect, useRef, useState } from "react";
import {
  trackAnalyticsEvent,
  trackAnalyticsEventBeacon,
  type AnalyticsEventType,
} from "@/lib/analytics/client";
import { getAnalyticsDeviceInfo } from "@/lib/analytics/device-info";

/**
 * Session lifecycle for student interaction analytics.
 *
 * One session row is created per entry into Practice / Exam / Review mode.
 * The session id is kept in `sessionStorage` so that navigations inside the
 * same tab can re-use it if needed, and so `beforeunload` handlers can send
 * a final `session_ended` / `stage_abandoned` beacon.
 *
 * See `docs/student-interaction-analytics-plan.md` → "Part A" for the
 * agreed rules.
 */

const SESSION_STORAGE_KEY = "kb-tutor-analytics-session";
const ABANDON_HIDDEN_MS = 60_000;

export type SessionMode = "practice" | "exam" | "review";

interface StoredSession {
  id: string;
  mode: SessionMode;
  startedAt: string;
}

interface StartSessionOptions {
  mode: SessionMode;
  assignmentId?: string;
}

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.id || !parsed.mode || !parsed.startedAt) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Storage full / disabled. Analytics loss is acceptable.
  }
}

export function getCurrentAnalyticsSessionId(): string | null {
  return readStoredSession()?.id ?? null;
}

async function requestStartSession(
  options: StartSessionOptions,
): Promise<StoredSession | null> {
  try {
    const deviceInfo = getAnalyticsDeviceInfo();
    const res = await fetch("/api/analytics/sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: options.mode,
        clientStartedAt: new Date().toISOString(),
        timezone:
          typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
        assignmentId: options.assignmentId,
        deviceType: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; startedAt?: string };
    if (!data.id) return null;
    return {
      id: data.id,
      mode: options.mode,
      startedAt: data.startedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function requestEndSession(sessionId: string, viaBeacon: boolean): void {
  const body = JSON.stringify({ endedAt: new Date().toISOString() });
  const url = `/api/analytics/sessions/${encodeURIComponent(sessionId)}`;

  if (viaBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      // sendBeacon only supports POST, so we tunnel via query string.
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(`${url}?_method=PATCH`, blob);
      if (ok) return;
    } catch {
      // Fall through.
    }
  }

  void fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Best-effort.
  });
}

interface UseAnalyticsSessionOptions {
  mode: SessionMode;
  assignmentId?: string;
  /** When true, skip creating a session. Useful while props are still loading. */
  enabled?: boolean;
}

interface UseAnalyticsSessionResult {
  sessionId: string | null;
  markStageCompleted: () => void;
}

/**
 * Manages one analytics session for the lifetime of the calling component.
 *
 * Responsibilities:
 * - POST a new session row on mount → emit `session_started` + `stage_started`.
 * - On `visibilitychange === "hidden"` longer than 60s, emit `stage_abandoned`
 *   (if the stage wasn't completed) and end the session.
 * - On `beforeunload` / `pagehide`, emit `session_ended` (and `stage_abandoned`
 *   if uncompleted) via `sendBeacon`.
 * - On unmount, if the consumer never called `markStageCompleted()`, emit
 *   `stage_abandoned` + end the session. If they did, just end the session.
 *
 * `useRef`-based guards keep behavior stable under React Strict Mode.
 */
export function useAnalyticsSession(
  options: UseAnalyticsSessionOptions,
): UseAnalyticsSessionResult {
  const { mode, assignmentId, enabled = true } = options;
  const [sessionId, setSessionId] = useState<string | null>(null);

  const stageCompletedRef = useRef(false);
  const sessionClosedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const hiddenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startInFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (startInFlightRef.current || sessionIdRef.current) return;
    startInFlightRef.current = true;

    let cancelled = false;

    void (async () => {
      const session = await requestStartSession({ mode, assignmentId });
      if (cancelled) return;
      if (!session) {
        startInFlightRef.current = false;
        return;
      }
      sessionIdRef.current = session.id;
      setSessionId(session.id);
      writeStoredSession(session);

      trackAnalyticsEvent({
        eventType: "session_started",
        mode,
        assignmentId,
        sessionId: session.id,
      });
      trackAnalyticsEvent({
        eventType: "stage_started",
        mode,
        assignmentId,
        sessionId: session.id,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, mode, assignmentId]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const clearHiddenTimer = () => {
      if (hiddenTimerRef.current !== null) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
    };

    const closeSession = (eventType: AnalyticsEventType | null, viaBeacon: boolean) => {
      const id = sessionIdRef.current;
      if (!id || sessionClosedRef.current) return;
      sessionClosedRef.current = true;

      if (!stageCompletedRef.current) {
        const abandonPayload = {
          eventType: "stage_abandoned" as AnalyticsEventType,
          mode,
          assignmentId,
          sessionId: id,
          payload: { reason: viaBeacon ? "tab_closed" : "component_unmounted" },
        };
        if (viaBeacon) trackAnalyticsEventBeacon(abandonPayload);
        else trackAnalyticsEvent(abandonPayload);
      }

      if (eventType) {
        const endedPayload = {
          eventType,
          mode,
          assignmentId,
          sessionId: id,
        };
        if (viaBeacon) trackAnalyticsEventBeacon(endedPayload);
        else trackAnalyticsEvent(endedPayload);
      }

      requestEndSession(id, viaBeacon);
      writeStoredSession(null);
    };

    const handleVisibility = () => {
      if (sessionClosedRef.current) return;
      if (document.visibilityState === "hidden") {
        clearHiddenTimer();
        hiddenTimerRef.current = setTimeout(() => {
          closeSession("session_ended", false);
        }, ABANDON_HIDDEN_MS);
      } else {
        clearHiddenTimer();
      }
    };

    const handleBeforeUnload = () => {
      clearHiddenTimer();
      closeSession("session_ended", true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handleBeforeUnload);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearHiddenTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handleBeforeUnload);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Component is being unmounted (e.g. the learner navigated away before
      // completing the stage). Fire the abandonment + close the session.
      closeSession("session_ended", false);
    };
  }, [enabled, mode, assignmentId]);

  return {
    sessionId,
    markStageCompleted: () => {
      stageCompletedRef.current = true;
    },
  };
}
