import { calculateStreak } from "@/lib/progress/streak";
import type { AttemptRow } from "@/lib/progress/mastery";

export { calculateStreak };

function toDateKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(value);
}

export function toAttemptRow(answeredAt: string): AttemptRow {
  return { is_correct: false, answered_at: answeredAt, topic: null, standard_id: null };
}

export function getDistinctActiveDateKeys(answeredAtValues: string[], timeZone: string): string[] {
  const keys = new Set(answeredAtValues.map((value) => toDateKey(new Date(value), timeZone)));
  return Array.from(keys).sort();
}

/**
 * True if, anywhere in the student's history, there is a gap of at least
 * `gapDays` calendar days between two consecutive active days — i.e. the
 * student took a break of that length and then came back.
 */
export function hasComebackGap(activeDateKeysAscending: string[], gapDays: number): boolean {
  for (let i = 1; i < activeDateKeysAscending.length; i += 1) {
    const previous = new Date(`${activeDateKeysAscending[i - 1]}T00:00:00Z`);
    const current = new Date(`${activeDateKeysAscending[i]}T00:00:00Z`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= gapDays) return true;
  }
  return false;
}
