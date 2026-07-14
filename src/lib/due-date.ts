/**
 * Helpers for the assignment `due_date` column, which is stored as
 * `timestamp with time zone` in Postgres (full date + time + timezone).
 *
 * The edit / create forms use `<input type="datetime-local">` which works in
 * the user's local timezone and uses the format `YYYY-MM-DDTHH:mm` (no tz,
 * no seconds). Use these helpers at the boundaries so the stored value is
 * always ISO (UTC).
 */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Convert an ISO timestamp coming back from Supabase into the
 * `YYYY-MM-DDTHH:mm` value expected by `<input type="datetime-local">`,
 * rendered in the user's local timezone. Returns empty string for null /
 * invalid input so it can be fed directly into the input value.
 */
export function isoToDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * Inverse of `isoToDateTimeLocalValue`. `datetime-local` values have no tz,
 * so the `Date` constructor interprets them as local time, which is exactly
 * what the user sees — `toISOString()` then gives the correct UTC timestamp.
 * Returns null for empty / invalid input so callers can pass it straight to
 * a JSON body.
 */
export function dateTimeLocalValueToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dayKey(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
}

export type DueRelativeOptions = {
  now?: Date;
  /** IANA timezone for the day comparison. Defaults to the host's local tz. */
  timeZone?: string;
};

/**
 * Compact relative due-date label for the homepage assignment rows:
 * "Overdue" / "Due today" / "Due tomorrow" / "Due Jul 5".
 * Returns empty string for null / invalid input.
 */
export function formatDueRelative(
  iso: string | null | undefined,
  { now = new Date(), timeZone }: DueRelativeOptions = {},
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (d.getTime() < now.getTime()) return "Overdue";
  const dueKey = dayKey(d, timeZone);
  if (dueKey === dayKey(now, timeZone)) return "Due today";
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (dueKey === dayKey(tomorrow, timeZone)) return "Due tomorrow";
  return `Due ${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone,
  })}`;
}

/**
 * Whether the due date warrants the urgent (red) treatment: overdue, due
 * today, or due tomorrow. Derived from `formatDueRelative` so the label and
 * the styling can never disagree.
 */
export function isDueUrgent(
  iso: string | null | undefined,
  options: DueRelativeOptions = {},
): boolean {
  const label = formatDueRelative(iso, options);
  return label === "Overdue" || label === "Due today" || label === "Due tomorrow";
}

/**
 * Localized display of a due-date timestamp. If the due date falls on today
 * (local time), returns "Today, HH:MM AM/PM". Otherwise returns the full
 * medium date + short time. Returns empty string for null / invalid input.
 */
export function formatDueDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    const time = d.toLocaleString(undefined, { timeStyle: "short" });
    return `Today, ${time}`;
  }
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
