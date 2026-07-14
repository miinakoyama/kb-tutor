import { describe, expect, it } from "vitest";
import {
  dateTimeLocalValueToIso,
  formatDueDateTime,
  formatDueRelative,
  isDueUrgent,
  isoToDateTimeLocalValue,
} from "@/lib/due-date";

describe("isoToDateTimeLocalValue", () => {
  it("returns an empty string for null, undefined, or empty input", () => {
    expect(isoToDateTimeLocalValue(null)).toBe("");
    expect(isoToDateTimeLocalValue(undefined)).toBe("");
    expect(isoToDateTimeLocalValue("")).toBe("");
  });

  it("returns an empty string for an invalid date string", () => {
    expect(isoToDateTimeLocalValue("not-a-date")).toBe("");
  });

  it("formats a valid ISO into YYYY-MM-DDTHH:mm (local)", () => {
    // Build a date via the Date constructor so we render it in whatever
    // timezone vitest happens to run in (usually UTC in CI). The shape
    // assertion is timezone-independent.
    const local = new Date(2026, 0, 2, 9, 5);
    const result = isoToDateTimeLocalValue(local.toISOString());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("round-trips through dateTimeLocalValueToIso", () => {
    const original = new Date(2026, 3, 15, 14, 30);
    const localString = isoToDateTimeLocalValue(original.toISOString());
    const backToIso = dateTimeLocalValueToIso(localString);
    expect(backToIso).not.toBeNull();
    // Dropping seconds/ms, the local-time interpretation should match.
    expect(new Date(backToIso!).getTime()).toBe(
      new Date(
        original.getFullYear(),
        original.getMonth(),
        original.getDate(),
        original.getHours(),
        original.getMinutes(),
      ).getTime(),
    );
  });
});

describe("dateTimeLocalValueToIso", () => {
  it("returns null for empty or invalid input", () => {
    expect(dateTimeLocalValueToIso("")).toBeNull();
    expect(dateTimeLocalValueToIso(null)).toBeNull();
    expect(dateTimeLocalValueToIso("not-a-date")).toBeNull();
  });

  it("returns an ISO string in UTC for a valid local value", () => {
    const iso = dateTimeLocalValueToIso("2026-04-15T14:30");
    expect(iso).not.toBeNull();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("formatDueDateTime", () => {
  it("returns an empty string for null or invalid input", () => {
    expect(formatDueDateTime(null)).toBe("");
    expect(formatDueDateTime(undefined)).toBe("");
    expect(formatDueDateTime("not-a-date")).toBe("");
  });

  it("returns a non-empty string for a valid ISO timestamp", () => {
    expect(formatDueDateTime("2026-04-15T14:30:00.000Z").length).toBeGreaterThan(
      0,
    );
  });
});

describe("formatDueRelative", () => {
  // Fixed "now": Wed 2026-07-08 15:00 UTC. Pin the timezone to UTC so the
  // day-boundary assertions don't depend on where the test runs.
  const OPTS = { now: new Date("2026-07-08T15:00:00Z"), timeZone: "UTC" };

  it("returns an empty string for null or invalid input", () => {
    expect(formatDueRelative(null, OPTS)).toBe("");
    expect(formatDueRelative(undefined, OPTS)).toBe("");
    expect(formatDueRelative("not-a-date", OPTS)).toBe("");
  });

  it("returns Overdue for a past due date", () => {
    expect(formatDueRelative("2026-07-08T14:00:00Z", OPTS)).toBe("Overdue");
    expect(formatDueRelative("2026-07-01T00:00:00Z", OPTS)).toBe("Overdue");
  });

  it("returns Due today for later the same day", () => {
    expect(formatDueRelative("2026-07-08T23:00:00Z", OPTS)).toBe("Due today");
  });

  it("returns Due tomorrow for the next calendar day", () => {
    expect(formatDueRelative("2026-07-09T01:00:00Z", OPTS)).toBe("Due tomorrow");
    expect(formatDueRelative("2026-07-09T23:59:00Z", OPTS)).toBe("Due tomorrow");
  });

  it("returns a short absolute date further out", () => {
    expect(formatDueRelative("2026-07-20T15:00:00Z", OPTS)).toBe("Due Jul 20");
  });

  it("respects the timeZone for the day comparison", () => {
    // 2026-07-09T02:00Z is Jul 9 in UTC (tomorrow) but still Jul 8 evening
    // in New York (today).
    const iso = "2026-07-09T02:00:00Z";
    expect(formatDueRelative(iso, OPTS)).toBe("Due tomorrow");
    expect(
      formatDueRelative(iso, { ...OPTS, timeZone: "America/New_York" }),
    ).toBe("Due today");
  });
});

describe("isDueUrgent", () => {
  const OPTS = { now: new Date("2026-07-08T15:00:00Z"), timeZone: "UTC" };

  it("is true for overdue, today, and tomorrow", () => {
    expect(isDueUrgent("2026-07-08T14:00:00Z", OPTS)).toBe(true);
    expect(isDueUrgent("2026-07-08T23:00:00Z", OPTS)).toBe(true);
    expect(isDueUrgent("2026-07-09T12:00:00Z", OPTS)).toBe(true);
  });

  it("is false further out and for missing dates", () => {
    expect(isDueUrgent("2026-07-20T15:00:00Z", OPTS)).toBe(false);
    expect(isDueUrgent(null, OPTS)).toBe(false);
  });
});
