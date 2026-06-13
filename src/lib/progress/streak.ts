import type { AttemptRow } from "@/lib/progress/mastery";

function toDateKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
  }).format(value);
}

/**
 * Calculates current daily streak from answered timestamps in the user's timezone.
 * A streak counts consecutive calendar days up to today.
 */
export function calculateStreak(rows: AttemptRow[], timeZone: string): number {
  const answeredDates = new Set(
    rows.map((row) => toDateKey(new Date(row.answered_at), timeZone)),
  );
  if (answeredDates.size === 0) return 0;

  let streak = 0;
  const cursor = new Date();

  while (true) {
    const key = toDateKey(cursor, timeZone);
    if (!answeredDates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
