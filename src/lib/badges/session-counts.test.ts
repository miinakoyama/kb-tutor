import { describe, expect, it } from "vitest";
import { countSessionsByMode, type SessionCountAttemptRow } from "@/lib/badges/session-counts";

const TZ = "UTC";

function row(mode: string, assignmentId: string | null, answeredAt: string): SessionCountAttemptRow {
  return { mode, assignmentId, answeredAt };
}

describe("countSessionsByMode", () => {
  it("counts self_practice only when mode=practice and assignment_id is null", () => {
    const rows = [
      row("practice", null, "2026-01-01T10:00:00.000Z"),
      row("practice", "assignment-1", "2026-01-02T10:00:00.000Z"),
      row("exam", null, "2026-01-03T10:00:00.000Z"),
    ];

    expect(countSessionsByMode(rows, TZ)).toEqual({ self_practice: 1, exam: 1, review: 0 });
  });

  it("collapses multiple attempts on the same day into one session", () => {
    const rows = [
      row("practice", null, "2026-01-01T09:00:00.000Z"),
      row("practice", null, "2026-01-01T15:00:00.000Z"),
      row("practice", null, "2026-01-01T23:00:00.000Z"),
    ];

    expect(countSessionsByMode(rows, TZ).self_practice).toBe(1);
  });

  it("counts distinct days across modes independently", () => {
    const rows = [
      row("exam", null, "2026-01-01T10:00:00.000Z"),
      row("exam", "assignment-1", "2026-01-02T10:00:00.000Z"),
      row("review", null, "2026-01-01T10:00:00.000Z"),
      row("review", "assignment-2", "2026-01-03T10:00:00.000Z"),
    ];

    expect(countSessionsByMode(rows, TZ)).toEqual({ self_practice: 0, exam: 2, review: 2 });
  });

  it("returns zeros for no attempts", () => {
    expect(countSessionsByMode([], TZ)).toEqual({ self_practice: 0, exam: 0, review: 0 });
  });
});
