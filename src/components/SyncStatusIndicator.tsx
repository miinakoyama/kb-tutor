"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CloudOff,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import {
  getSyncStatus,
  retryAllPending,
  subscribeSyncStatus,
  type SyncStatus,
} from "@/lib/sync-queue";

/**
 * Non-intrusive pill at the bottom-right that surfaces durability state:
 *  - hidden when idle (the common case)
 *  - subtle slate spinner while saving/retrying
 *  - brief emerald flash when the queue drains
 *  - amber "Offline — will sync" when the browser reports offline
 *  - violet "Some items couldn't sync" with a Retry button after many failures
 *
 * Colors avoid red per product preference.
 */
export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());

  useEffect(() => {
    return subscribeSyncStatus(setStatus);
  }, []);

  if (status.kind === "idle") return null;

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
      return {
        tone: "border-slate-200 bg-white/90 text-slate-600",
        icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />,
        label: labelFor("Saving", status.queuedCount),
        action: null,
      };
    case "retrying":
      return {
        tone: "border-amber-200 bg-amber-50/95 text-amber-800",
        icon: <RefreshCw className="size-3.5 animate-spin" aria-hidden />,
        label: labelFor("Retrying", status.queuedCount),
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
          <button
            type="button"
            onClick={() => void retryAllPending()}
            className="ml-1 rounded-full border border-violet-300 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 hover:bg-white"
          >
            Retry
          </button>
        ),
      };
    case "saved":
      return {
        tone: "border-emerald-200 bg-emerald-50/95 text-emerald-800",
        icon: <CheckCircle2 className="size-3.5" aria-hidden />,
        label: "Saved",
        action: null,
      };
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

function labelFor(verb: string, count: number): string {
  if (count <= 0) return `${verb}…`;
  return `${verb} ${count} item${count === 1 ? "" : "s"}…`;
}
