import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_TIME_ZONE,
  isValidTimeZone,
  normalizeTimeZone,
} from "@/lib/timezone";

describe("isValidTimeZone", () => {
  it("returns true for common IANA time zones", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
  });

  it("returns false for invalid time zone strings", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});

describe("normalizeTimeZone", () => {
  it("returns the given time zone when it is valid", () => {
    expect(normalizeTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("returns the fallback when the value is invalid", () => {
    expect(normalizeTimeZone("Invalid/Zone")).toBe(DEFAULT_APP_TIME_ZONE);
  });

  it("respects a custom fallback", () => {
    expect(normalizeTimeZone(undefined, "Europe/London")).toBe("Europe/London");
  });
});
