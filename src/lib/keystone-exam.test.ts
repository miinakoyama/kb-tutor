import { describe, expect, it } from "vitest";
import { daysUntilExam, formatExamDate } from "./keystone-exam";

describe("daysUntilExam", () => {
  it("returns a positive integer for future dates", () => {
    const now = new Date(2026, 4, 1);
    expect(daysUntilExam("2026-05-11", now)).toBe(10);
  });

  it("returns 0 when the exam is today", () => {
    const now = new Date(2026, 4, 1, 15, 30);
    expect(daysUntilExam("2026-05-01", now)).toBe(0);
  });

  it("returns a negative integer for past dates", () => {
    const now = new Date(2026, 4, 10);
    expect(daysUntilExam("2026-05-01", now)).toBe(-9);
  });

  it("returns null for malformed input", () => {
    const now = new Date(2026, 4, 1);
    expect(daysUntilExam("not-a-date", now)).toBeNull();
    expect(daysUntilExam("2026/05/01", now)).toBeNull();
  });

  it("handles month and year boundaries correctly", () => {
    const now = new Date(2026, 11, 25);
    expect(daysUntilExam("2027-01-05", now)).toBe(11);
  });
});

describe("formatExamDate", () => {
  it("formats a valid YYYY-MM-DD string", () => {
    expect(formatExamDate("2026-05-15")).toMatch(/May 15, 2026/);
  });

  it("returns the input as-is for malformed strings", () => {
    expect(formatExamDate("bad")).toBe("bad");
  });
});
