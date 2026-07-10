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
