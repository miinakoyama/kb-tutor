"use client";

import { useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import {
  discardFailedPending,
  getSyncStatus,
  retryAllPending,
  subscribeSyncStatus,
  type SyncStatus,
} from "@/lib/sync-queue";

/**
 * Minimal pill at the top-right. We intentionally stay silent during the
 * normal happy path — users found the constant "Saving 1 item…" flicker
 * distracting and confused it with a bug even when the queue was draining
 * healthily. Visible cases:
 *  - `offline`: always visible (user needs to know writes won't reach the
 *    server until they reconnect).
 *  - `failed`: always visible (MAX_TRIES exceeded; user action may be needed).
 *  - `saving`/`retrying`: hidden for the first STUCK_THRESHOLD_MS so quick
 *    round-trips don't flash a pill. Shown afterwards as a single "still
 *    saving…" notice so a genuinely stuck network doesn't look silently broken.
 *  - `saved`/`idle`: never shown.
 *
 * Colors avoid red per product preference.
 */

// How long a save must be in-flight before we surface it. Normal Supabase
// round-trips are well under a second; anything beyond this usually means
// the user is on a flaky connection or hitting a server-side issue.
const STUCK_THRESHOLD_MS = 8_000;

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [stuck, setStuck] = useState(false);
  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeSyncStatus(setStatus);
  }, []);

  useEffect(() => {
    const inflight = status.kind === "saving" || status.kind === "retrying";
    if (!inflight) {
      if (stuckTimer.current) {
        clearTimeout(stuckTimer.current);
        stuckTimer.current = null;
      }
      if (stuck) setStuck(false);
      return;
    }
    if (stuckTimer.current) return;
    stuckTimer.current = setTimeout(() => {
      setStuck(true);
      stuckTimer.current = null;
    }, STUCK_THRESHOLD_MS);
    return () => {
      if (stuckTimer.current) {
        clearTimeout(stuckTimer.current);
        stuckTimer.current = null;
      }
    };
  }, [status.kind, stuck]);

  const shouldShow =
    status.kind === "offline" ||
    status.kind === "failed" ||
    ((status.kind === "saving" || status.kind === "retrying") && stuck);

  if (!shouldShow) return null;

  const { tone, icon, label, action } = render(status);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 flex"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur ${tone}`}
      >
        {icon}
        <span>{label}</span>
        {action}
      </div>
    </div>
  );
}

function render(status: SyncStatus): {
  tone: string;
  icon: React.ReactNode;
  label: string;
  action: React.ReactNode | null;
} {
  switch (status.kind) {
    case "saving":
    case "retrying": {
      // Only reached after STUCK_THRESHOLD_MS, so we describe it as taking
      // longer than usual rather than a normal in-flight save.
      const count = status.queuedCount;
      const label = `Still saving ${count} item${count === 1 ? "" : "s"}…`;
      return {
        tone: "border-amber-200 bg-amber-50/95 text-amber-800",
        icon: <RefreshCw className="size-3.5 animate-spin" aria-hidden />,
        label,
        action: (
          <button
            type="button"
            onClick={() => void retryAllPending()}
            className="ml-1 rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 hover:bg-white"
          >
            Retry now
          </button>
        ),
      };
    }
    case "offline":
      return {
        tone: "border-slate-300 bg-slate-100/95 text-slate-700",
        icon: <CloudOff className="size-3.5" aria-hidden />,
        label: `Offline — will sync ${status.queuedCount} item${
          status.queuedCount === 1 ? "" : "s"
        } when reconnected`,
        action: null,
      };
    case "failed":
      return {
        tone: "border-violet-300 bg-violet-50/95 text-violet-800",
        icon: <TriangleAlert className="size-3.5" aria-hidden />,
        label: `Couldn't sync ${status.queuedCount} item${
          status.queuedCount === 1 ? "" : "s"
        }`,
        action: (
          <>
            <button
              type="button"
              onClick={() => void retryAllPending()}
              className="ml-1 rounded-full border border-violet-300 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 hover:bg-white"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => discardFailedPending()}
              className="ml-1 rounded-full border border-violet-200 bg-white/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 hover:bg-white"
            >
              Dismiss
            </button>
          </>
        ),
      };
    case "saved":
    case "idle":
    default:
      return {
        tone: "",
        icon: null,
        label: "",
        action: null,
      };
  }
}
