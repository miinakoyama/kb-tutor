export type AnalyticsEventType =
  | "session_started"
  | "session_ended"
  | "question_viewed"
  | "hint_opened"
  | "hint_closed"
  | "explanation_opened"
  | "attempt_submitted"
  | "review_mode_entered"
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

export function trackAnalyticsEvent(input: TrackAnalyticsEventInput): void {
  if (typeof window === "undefined") return;

  const body = {
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
