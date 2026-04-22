const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnlyLocal(
  value: string,
  endOfDay: boolean,
): Date | null {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseDateValue(value: string, endOfDay: boolean): Date | null {
  if (DATE_ONLY_PATTERN.test(value)) {
    return parseDateOnlyLocal(value, endOfDay);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function parseAnalyticsWindow(
  url: URL,
  options?: { defaultDays?: number },
): { from: Date; to: Date } {
  const defaultDays = options?.defaultDays ?? 30;
  const now = new Date();
  const fallbackFrom = new Date(now);
  fallbackFrom.setDate(now.getDate() - defaultDays);
  fallbackFrom.setHours(0, 0, 0, 0);

  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw ? parseDateValue(fromRaw, false) ?? fallbackFrom : fallbackFrom;
  const to = toRaw ? parseDateValue(toRaw, true) ?? now : now;

  if (to.getTime() < from.getTime()) {
    const correctedTo = new Date(from);
    correctedTo.setHours(23, 59, 59, 999);
    return { from, to: correctedTo };
  }
  return { from, to };
}

export function parseSchoolIds(url: URL): string[] {
  const values = [
    ...url.searchParams.getAll("schoolId"),
    ...url.searchParams.getAll("schoolIds"),
  ];

  const ids = values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}
