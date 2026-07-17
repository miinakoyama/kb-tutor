import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Learning-effort data for the homepage chart.
 *
 * "Effort" = time actually spent working, summed per day from three sources:
 *  1. `attempts.time_spent_sec`             — per-question MCQ answering time
 *     (practice / exam / review modes all record it, visibility-aware),
 *  2. `short_answer_attempts.time_spent_sec` — per-part SAQ answering time,
 *  3. `page_dwell_events.seconds`            — visible time on the Review tab
 *     (heartbeat rows flushed by `usePageDwell`).
 *
 * This deliberately does NOT use `analytics_sessions`: those measure
 * component-mount wall time (idle included) and depend on an exit beacon for
 * `ended_at` that frequently never fires.
 *
 * Both the weekly and the monthly series are produced from one fetch so the
 * Weekly/Monthly toggle is pure client state. All bucketing happens in the
 * student's timezone via `Intl.DateTimeFormat` date keys — the same approach
 * as `calculateStreak`.
 */

/** How a chunk of study time is categorized for the breakdown pie. */
export type EffortCategory = "practice" | "exam" | "review";

/** Fixed slice order for the breakdown pie. */
export const EFFORT_CATEGORY_ORDER: EffortCategory[] = [
  "practice",
  "exam",
  "review",
];

/** One timed unit of work: an answered question/part or a dwell heartbeat. */
export type EffortItem = {
  /** ISO timestamp the work is attributed to. */
  at: string;
  seconds: number | null;
  category: EffortCategory;
};

export type EffortBar = {
  label: string;
  seconds: number;
  /** True for the bucket containing "today" in the student's timezone. */
  isCurrent: boolean;
};

export type EffortSlice = {
  category: EffortCategory;
  seconds: number;
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
  /**
   * This period's time split by category, in EFFORT_CATEGORY_ORDER, with
   * zero-time categories omitted. Empty when the period has no recorded time.
   */
  breakdown: EffortSlice[];
};

export type LearningEffort = {
  weekly: EffortSeries;
  monthly: EffortSeries;
};

const FETCH_LIMIT = 5000;

/**
 * Per-item ceiling. Recorded times are visibility-aware on the writer side,
 * so multi-hour values are corrupt rather than real; clamping (instead of
 * dropping) keeps the item's honest signal without letting one stuck timer
 * distort a week.
 */
const MAX_ITEM_SEC = 30 * 60;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Sanitized seconds for one item: non-finite/absent → 0, clamped to cap. */
export function itemSeconds(item: EffortItem): number {
  const { seconds } = item;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.min(seconds, MAX_ITEM_SEC);
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

/** Sums per-day effort, keyed by each item's date in the tz. */
export function bucketByDay(
  items: EffortItem[],
  timeZone: string,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const item of items) {
    const seconds = itemSeconds(item);
    if (seconds === 0) continue;
    const at = new Date(item.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = dateKeyInZone(at, timeZone);
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
  // buildLearningEffort fills breakdown; a series built in isolation has none.
  return { bars, totalSeconds, previousTotalSeconds, deltaPercent, breakdown: [] };
}

/**
 * Time split by category for items falling in [fromKey, toKeyExclusive),
 * in EFFORT_CATEGORY_ORDER with zero-time categories omitted.
 */
export function breakdownInRange(
  items: EffortItem[],
  timeZone: string,
  fromKey: string,
  toKeyExclusive: string,
): EffortSlice[] {
  const byCategory = new Map<EffortCategory, number>();
  for (const item of items) {
    const seconds = itemSeconds(item);
    if (seconds === 0) continue;
    const at = new Date(item.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = dateKeyInZone(at, timeZone);
    if (key < fromKey || key >= toKeyExclusive) continue;
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + seconds);
  }
  return EFFORT_CATEGORY_ORDER.flatMap((category) => {
    const seconds = byCategory.get(category) ?? 0;
    return seconds > 0 ? [{ category, seconds }] : [];
  });
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
  items: EffortItem[],
  timeZone: string,
  now: Date,
): LearningEffort {
  const byDay = bucketByDay(items, timeZone);
  const todayKey = dateKeyInZone(now, timeZone);

  const weekStart = weekStartKey(todayKey, 0);
  const weekEnd = addDaysToKey(weekStart, 7);
  const monthStart = monthStartKey(todayKey, 0);
  const monthEnd = monthStartKey(todayKey, 1);

  return {
    weekly: {
      ...buildWeeklySeries(byDay, todayKey),
      breakdown: breakdownInRange(items, timeZone, weekStart, weekEnd),
    },
    monthly: {
      ...buildMonthlySeries(byDay, todayKey),
      breakdown: breakdownInRange(items, timeZone, monthStart, monthEnd),
    },
  };
}

type TimedRow = Record<string, unknown>;

/** Maps a stored mode string to a breakdown category; defaults to practice. */
function toCategory(value: unknown): EffortCategory {
  return value === "exam" || value === "review" ? value : "practice";
}

function rowsToItems(
  rows: TimedRow[],
  atColumn: string,
  secondsColumn: string,
  category: EffortCategory | ((row: TimedRow) => EffortCategory),
): EffortItem[] {
  return rows.map((row) => ({
    at: String(row[atColumn] ?? ""),
    seconds:
      typeof row[secondsColumn] === "number" ? (row[secondsColumn] as number) : null,
    category: typeof category === "function" ? category(row) : category,
  }));
}

/**
 * Fetches all three effort sources back to the start of the previous
 * calendar month (the earliest instant either series or either comparison
 * needs) and assembles both series. Returns null (not an all-zero chart)
 * when any query fails — the three sources ship as one feature, and a
 * partial sum silently presented as the total would be worse than "no data".
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
  const since = new Date(
    Date.UTC(prevMonthStart.y, prevMonthStart.m - 1, prevMonthStart.d - 1),
  ).toISOString();

  const [mcq, saq, dwell] = await Promise.all([
    supabase
      .from("attempts")
      .select("time_spent_sec,answered_at,mode")
      .eq("user_id", studentUserId)
      .gte("answered_at", since)
      .order("answered_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("short_answer_attempts")
      .select("time_spent_sec,answered_at,mode")
      .eq("user_id", studentUserId)
      .gte("answered_at", since)
      .order("answered_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("page_dwell_events")
      .select("seconds,occurred_at")
      .eq("user_id", studentUserId)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(FETCH_LIMIT),
  ]);

  if (mcq.error || !mcq.data || saq.error || !saq.data || dwell.error || !dwell.data) {
    return null;
  }

  const byMode = (row: TimedRow) => toCategory(row.mode);
  const items: EffortItem[] = [
    ...rowsToItems(mcq.data, "answered_at", "time_spent_sec", byMode),
    ...rowsToItems(saq.data, "answered_at", "time_spent_sec", byMode),
    // Review-tab dwell is review time by definition.
    ...rowsToItems(dwell.data, "occurred_at", "seconds", "review"),
  ];

  return buildLearningEffort(items, timeZone, now);
}
