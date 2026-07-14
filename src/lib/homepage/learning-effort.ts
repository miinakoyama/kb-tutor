import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Learning-effort data for the homepage chart, computed from
 * `analytics_sessions` (one row per Practice / Exam / Review session, written
 * by the session lifecycle in `src/lib/analytics/session.ts`).
 *
 * Both the weekly and the monthly series are produced from one query so the
 * Weekly/Monthly toggle is pure client state. All bucketing happens in the
 * student's timezone via `Intl.DateTimeFormat` date keys — the same approach
 * as `calculateStreak`.
 *
 * Known undercount: `ended_at` is written best-effort from
 * `beforeunload`/`pagehide` beacons, so a closed laptop lid leaves it NULL and
 * that session contributes 0. Callers must treat an all-zero result as "no
 * recorded time", not as proof the student did nothing.
 */

export type SessionRow = {
  started_at: string;
  ended_at: string | null;
};

export type EffortBar = {
  label: string;
  seconds: number;
  /** True for the bucket containing "today" in the student's timezone. */
  isCurrent: boolean;
};

export type EffortSeries = {
  bars: EffortBar[];
  totalSeconds: number;
  previousTotalSeconds: number;
  /**
   * Percent change vs the previous period, rounded. Null when the previous
   * period has no recorded time — a percentage increase from zero is
   * undefined, and the UI hides the comparison line instead of inventing one.
   */
  deltaPercent: number | null;
};

export type LearningEffort = {
  weekly: EffortSeries;
  monthly: EffortSeries;
};

const FETCH_LIMIT = 2000;

/** Same sanity rules as the admin `insights_session_durations` RPC. */
const MAX_SESSION_SEC = 6 * 60 * 60;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Duration of one session in seconds, applying the exact sanity rules the
 * admin insights RPC uses: `ended_at` present, after `started_at`, and under
 * 6 hours. Anything else counts as 0 so one stuck row can't distort a week.
 */
export function sessionDurationSec(row: SessionRow): number {
  if (!row.ended_at) return 0;
  const started = new Date(row.started_at).getTime();
  const ended = new Date(row.ended_at).getTime();
  if (Number.isNaN(started) || Number.isNaN(ended)) return 0;
  const seconds = (ended - started) / 1000;
  if (seconds <= 0 || seconds >= MAX_SESSION_SEC) return 0;
  return seconds;
}

/** "YYYY-MM-DD" for the instant as seen in the given timezone. */
function dateKeyInZone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(value);
}

function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/**
 * Date-key arithmetic runs on Date.UTC so it is immune to the host machine's
 * timezone and to DST — the timezone only matters when converting an instant
 * to a key, which `dateKeyInZone` already did.
 */
function addDaysToKey(key: string, days: number): string {
  const { y, m, d } = parseDateKey(key);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function weekdayOfKey(key: string): number {
  const { y, m, d } = parseDateKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonthOfKey(key: string): number {
  const { y, m } = parseDateKey(key);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First day ("YYYY-MM-01") of the key's month, shifted by `monthOffset`. */
function monthStartKey(key: string, monthOffset: number): string {
  const { y, m } = parseDateKey(key);
  const date = new Date(Date.UTC(y, m - 1 + monthOffset, 1));
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing `key`, shifted by `weekOffset` weeks. */
function weekStartKey(key: string, weekOffset: number): string {
  const mondayOffset = (weekdayOfKey(key) + 6) % 7;
  return addDaysToKey(key, -mondayOffset + weekOffset * 7);
}

/** Sums per-day durations, keyed by the session's start date in the tz. */
export function bucketByDay(
  rows: SessionRow[],
  timeZone: string,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const seconds = sessionDurationSec(row);
    if (seconds === 0) continue;
    const key = dateKeyInZone(new Date(row.started_at), timeZone);
    byDay.set(key, (byDay.get(key) ?? 0) + seconds);
  }
  return byDay;
}

function sumRange(byDay: Map<string, number>, fromKey: string, toKeyExclusive: string): number {
  let total = 0;
  for (const [key, seconds] of byDay) {
    if (key >= fromKey && key < toKeyExclusive) total += seconds;
  }
  return total;
}

function withDelta(bars: EffortBar[], previousTotalSeconds: number): EffortSeries {
  const totalSeconds = bars.reduce((sum, bar) => sum + bar.seconds, 0);
  const deltaPercent =
    previousTotalSeconds > 0
      ? Math.round(((totalSeconds - previousTotalSeconds) / previousTotalSeconds) * 100)
      : null;
  return { bars, totalSeconds, previousTotalSeconds, deltaPercent };
}

/**
 * Mon–Sun of the week containing `todayKey`, compared against the previous
 * Mon–Sun week.
 */
export function buildWeeklySeries(
  byDay: Map<string, number>,
  todayKey: string,
): EffortSeries {
  const monday = weekStartKey(todayKey, 0);
  const bars: EffortBar[] = [];
  for (let i = 0; i < 7; i += 1) {
    const key = addDaysToKey(monday, i);
    bars.push({
      label: WEEKDAY_LABELS[weekdayOfKey(key)],
      seconds: byDay.get(key) ?? 0,
      isCurrent: key === todayKey,
    });
  }
  const prevMonday = weekStartKey(todayKey, -1);
  return withDelta(bars, sumRange(byDay, prevMonday, monday));
}

/**
 * The current calendar month bucketed by 7-day weeks (W1 = days 1–7, …),
 * compared against the previous calendar month's total. Keeps the same
 * bar-chart shape as the weekly view.
 */
export function buildMonthlySeries(
  byDay: Map<string, number>,
  todayKey: string,
): EffortSeries {
  const monthStart = monthStartKey(todayKey, 0);
  const dayCount = daysInMonthOfKey(todayKey);
  const weekCount = Math.ceil(dayCount / 7);
  const todayDay = parseDateKey(todayKey).d;

  const bars: EffortBar[] = [];
  for (let w = 0; w < weekCount; w += 1) {
    const firstDay = w * 7 + 1;
    const lastDay = Math.min(firstDay + 6, dayCount);
    const fromKey = addDaysToKey(monthStart, firstDay - 1);
    const toKeyExclusive = addDaysToKey(monthStart, lastDay);
    bars.push({
      label: `W${w + 1}`,
      seconds: sumRange(byDay, fromKey, toKeyExclusive),
      isCurrent: todayDay >= firstDay && todayDay <= lastDay,
    });
  }

  const prevMonthStart = monthStartKey(todayKey, -1);
  return withDelta(bars, sumRange(byDay, prevMonthStart, monthStart));
}

/** Pure assembly of both series — exported for tests. */
export function buildLearningEffort(
  rows: SessionRow[],
  timeZone: string,
  now: Date,
): LearningEffort {
  const byDay = bucketByDay(rows, timeZone);
  const todayKey = dateKeyInZone(now, timeZone);
  return {
    weekly: buildWeeklySeries(byDay, todayKey),
    monthly: buildMonthlySeries(byDay, todayKey),
  };
}

/**
 * Fetches the student's sessions back to the start of the previous calendar
 * month (the earliest instant either series or either comparison needs) and
 * assembles both series. Returns null (not an all-zero chart) when the query
 * itself fails, so the UI can omit the card instead of showing misleading
 * zeros. All-zero data from a *successful* query is real: the student has no
 * recorded time, and the card should say so.
 */
export async function getLearningEffort(
  supabase: SupabaseClient,
  studentUserId: string,
  { timeZone, now = new Date() }: { timeZone: string; now?: Date },
): Promise<LearningEffort | null> {
  const todayKey = dateKeyInZone(now, timeZone);
  const prevMonthStart = parseDateKey(monthStartKey(todayKey, -1));
  // The DB filter only needs to be ≤ the true tz-local boundary — the pure
  // functions re-bucket by date key anyway — so pad by a day instead of
  // computing the exact tz offset.
  const since = new Date(Date.UTC(prevMonthStart.y, prevMonthStart.m - 1, prevMonthStart.d - 1));

  const { data, error } = await supabase
    .from("analytics_sessions")
    .select("started_at,ended_at")
    .eq("user_id", studentUserId)
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error || !data) return null;

  return buildLearningEffort(data as SessionRow[], timeZone, now);
}
