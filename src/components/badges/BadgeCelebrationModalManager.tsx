"use client";

import { useEffect, useState } from "react";
import { subscribeToBadgesEarned } from "@/lib/badges/celebration-events";
import { BadgeCelebrationModal } from "@/components/badges/BadgeCelebrationModal";
import type { EarnedBadgeSummary } from "@/types/badges";

/**
 * Global subscriber for session-end badge celebrations. Queues badges as
 * they're reported (a session can earn several at once) and shows exactly
 * one modal at a time.
 */
export function BadgeCelebrationModalManager() {
  const [queue, setQueue] = useState<EarnedBadgeSummary[]>([]);

  useEffect(() => {
    return subscribeToBadgesEarned((badges) => {
      setQueue((prev) => [...prev, ...badges]);
    });
  }, []);

  const current = queue[0] ?? null;
  if (!current) return null;

  return (
    <BadgeCelebrationModal
      badge={current}
      onDismiss={() => setQueue((prev) => prev.slice(1))}
    />
  );
}
