export type AnalyticsEventType =
  | "session_started"
  | "session_ended"
  | "question_viewed"
  | "hint_opened"
  | "hint_closed"
  | "explanation_opened"
  | "attempt_submitted"
  | "review_mode_entered"
  | "review_mode_exited"
  | "review_item_opened"
  | "review_item_completed"
  | "stage_started"
  | "stage_completed"
  | "stage_abandoned";

export interface TrackAnalyticsEventInput {
  eventType: AnalyticsEventType;
  mode?: string;
  questionId?: string;
  assignmentId?: string;
  sessionId?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}

function buildEventBody(input: TrackAnalyticsEventInput) {
  return {
    eventType: input.eventType,
    mode: input.mode,
    questionId: input.questionId,
    assignmentId: input.assignmentId,
    sessionId: input.sessionId,
    occurredAt: input.occurredAt,
    payload: input.payload,
    clientEventId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : undefined,
  };
}

export function trackAnalyticsEvent(input: TrackAnalyticsEventInput): void {
  if (typeof window === "undefined") return;

  const body = buildEventBody(input);

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // Best-effort telemetry; analytics loss should not break learning flow.
  });
}

/**
 * Fire-and-forget variant optimized for `beforeunload` / `pagehide`. Uses
 * `navigator.sendBeacon` when available because the page is being torn down
 * and `fetch` (even with `keepalive: true`) is less reliable at that point.
 */
export function trackAnalyticsEventBeacon(input: TrackAnalyticsEventInput): void {
  if (typeof window === "undefined") return;

  const body = buildEventBody(input);
  const payload = JSON.stringify(body);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/analytics/events", blob);
      if (ok) return;
    } catch {
      // Fall through to keepalive fetch below.
    }
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Best-effort telemetry.
  });
}
