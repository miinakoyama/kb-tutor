import { describe, expect, it } from "vitest";
import {
  dateTimeLocalValueToIso,
  formatDueDateTime,
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
