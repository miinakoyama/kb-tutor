import type { GradedFeedback, PartLabel, ShortAnswerPart } from "@/types/short-answer";

export const MAX_SHORT_ANSWER_ATTEMPTS = 2;

export interface StoredShortAnswerAttempt {
  id: string;
  part_label: PartLabel;
  attempt_number: number;
  response_text: string;
  feedback: GradedFeedback;
  is_correct: boolean;
}

export interface HydratedAttemptHistoryEntry {
  attemptNumber: number;
  correct: boolean;
  responseText: string;
  feedback: GradedFeedback;
}

export type HydratedPartStatus = "locked" | "active" | "submitting" | "resolved";

export interface PartRuntimeState {
  status: HydratedPartStatus;
  attempts: HydratedAttemptHistoryEntry[];
  latestFeedback: GradedFeedback | null;
  latestAttemptId: string | null;
  triesLeft: number;
  reported: boolean;
  countdownActive: boolean;
}

function initialRuntime(index: number): PartRuntimeState {
  return {
    status: index === 0 ? "active" : "locked",
    attempts: [],
    latestFeedback: null,
    latestAttemptId: null,
    triesLeft: MAX_SHORT_ANSWER_ATTEMPTS,
    reported: false,
    countdownActive: false,
  };
}

/** Rebuild per-part UI state from persisted short_answer_attempts rows. */
export function buildPartRuntimesFromStoredAttempts(
  parts: ShortAnswerPart[],
  rows: StoredShortAnswerAttempt[],
): { runtimes: PartRuntimeState[]; allResolved: boolean } {
  const partStates = parts.map((part) => {
    const partRows = rows
      .filter((row) => row.part_label === part.label)
      .sort((a, b) => a.attempt_number - b.attempt_number);

    const attempts: HydratedAttemptHistoryEntry[] = partRows.map((row) => ({
      attemptNumber: row.attempt_number,
      correct: row.is_correct,
      responseText: row.response_text,
      feedback: row.feedback,
    }));

    const latestRow = partRows[partRows.length - 1];
    const resolved =
      attempts.some((attempt) => attempt.correct) ||
      attempts.length >= MAX_SHORT_ANSWER_ATTEMPTS;

    return {
      attempts,
      latestFeedback: latestRow?.feedback ?? null,
      latestAttemptId: latestRow?.id ?? null,
      triesLeft: resolved ? 0 : Math.max(0, MAX_SHORT_ANSWER_ATTEMPTS - attempts.length),
      resolved,
    };
  });

  let activeAssigned = false;
  const runtimes = partStates.map((state, index) => {
    let status: HydratedPartStatus;
    if (state.resolved) {
      status = "resolved";
    } else if (!activeAssigned && (index === 0 || partStates[index - 1]?.resolved)) {
      status = "active";
      activeAssigned = true;
    } else {
      status = "locked";
    }

    return {
      status,
      attempts: state.attempts,
      latestFeedback: state.latestFeedback,
      latestAttemptId: state.latestAttemptId,
      triesLeft: state.triesLeft,
      reported: false,
      countdownActive: false,
    };
  });

  if (runtimes.length === 0) {
    return {
      runtimes: parts.map((_, index) => initialRuntime(index)),
      allResolved: false,
    };
  }

  return {
    runtimes,
    allResolved: partStates.every((state) => state.resolved),
  };
}
