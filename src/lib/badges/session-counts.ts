import type { SessionCountMode } from "@/types/badges";

export interface SessionCountAttemptRow {
  mode: string;
  assignmentId: string | null;
  answeredAt: string;
}

function toDateKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(value);
}

function matchesMode(row: SessionCountAttemptRow, mode: SessionCountMode): boolean {
  if (mode === "self_practice") return row.mode === "practice" && row.assignmentId === null;
  return row.mode === mode;
}

/**
 * Counts "sessions" per mode as the number of distinct calendar days (in the
 * given timezone) on which the student has at least one qualifying attempt.
 * This is an approximation of a real session boundary — two sittings on the
 * same day count as one — chosen so counts can be derived from the
 * self-readable `attempts` table without a new session-table RLS policy.
 */
export function countSessionsByMode(
  rows: SessionCountAttemptRow[],
  timeZone: string,
): Record<SessionCountMode, number> {
  const dateKeysByMode: Record<SessionCountMode, Set<string>> = {
    self_practice: new Set(),
    exam: new Set(),
    review: new Set(),
  };

  for (const row of rows) {
    const dateKey = toDateKey(new Date(row.answeredAt), timeZone);
    for (const mode of Object.keys(dateKeysByMode) as SessionCountMode[]) {
      if (matchesMode(row, mode)) dateKeysByMode[mode].add(dateKey);
    }
  }

  return {
    self_practice: dateKeysByMode.self_practice.size,
    exam: dateKeysByMode.exam.size,
    review: dateKeysByMode.review.size,
  };
}
