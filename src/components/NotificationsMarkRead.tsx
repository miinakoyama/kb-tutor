"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget side effect that stamps `user_settings.notifications_last_read_at`
 * to the current time as soon as the notifications page is rendered. The current
 * render intentionally still displays "New" badges based on the pre-visit
 * timestamp so the student can see what changed; the update takes effect on the
 * next navigation.
 */
export function NotificationsMarkRead() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/notifications/mark-read", {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    }).catch(() => {
      // Ignore network errors — read state will catch up on the next visit.
    });
    return () => controller.abort();
  }, []);

  return null;
}
