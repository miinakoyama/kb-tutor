import { describe, expect, it } from "vitest";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";
import {
  bucketByDay,
  buildLearningEffort,
  buildMonthlySeries,
  buildWeeklySeries,
  getLearningEffort,
  sessionDurationSec,
  type SessionRow,
} from "@/lib/homepage/learning-effort";

const TZ = "America/New_York";

/** A session starting at `startIso` (UTC) lasting `minutes`. */
function session(startIso: string, minutes: number): SessionRow {
  const started = new Date(startIso);
  const ended = new Date(started.getTime() + minutes * 60_000);
  return { started_at: started.toISOString(), ended_at: ended.toISOString() };
}

describe("sessionDurationSec", () => {
  it("returns the duration in seconds for a sane session", () => {
    expect(sessionDurationSec(session("2026-07-08T15:00:00Z", 25))).toBe(25 * 60);
  });

  it("returns 0 when ended_at is missing (abandoned tab)", () => {
    expect(
      sessionDurationSec({ started_at: "2026-07-08T15:00:00Z", ended_at: null }),
    ).toBe(0);
  });

  it("returns 0 when ended_at is before started_at", () => {
    expect(
      sessionDurationSec({
        started_at: "2026-07-08T15:00:00Z",
        ended_at: "2026-07-08T14:00:00Z",
      }),
    ).toBe(0);
  });

  it("returns 0 for sessions of 6 hours or more (stuck rows)", () => {
    expect(sessionDurationSec(session("2026-07-08T02:00:00Z", 6 * 60))).toBe(0);
    expect(sessionDurationSec(session("2026-07-08T02:00:00Z", 6 * 60 - 1))).toBe(
      (6 * 60 - 1) * 60,
    );
  });

  it("returns 0 for unparseable timestamps", () => {
    expect(
      sessionDurationSec({ started_at: "garbage", ended_at: "2026-07-08T15:00:00Z" }),
    ).toBe(0);
  });
});

describe("bucketByDay", () => {
  it("assigns a session to its start day in the student's timezone", () => {
    // 02:00 UTC on Jul 9 is still 22:00 on Jul 8 in New York.
    const byDay = bucketByDay([session("2026-07-09T02:00:00Z", 30)], TZ);
    expect(byDay.get("2026-07-08")).toBe(30 * 60);
    expect(byDay.has("2026-07-09")).toBe(false);
  });

  it("sums multiple sessions on the same local day", () => {
    const byDay = bucketByDay(
      [session("2026-07-08T13:00:00Z", 10), session("2026-07-08T20:00:00Z", 20)],
      TZ,
    );
    expect(byDay.get("2026-07-08")).toBe(30 * 60);
  });

  it("skips zero-duration sessions entirely", () => {
    const byDay = bucketByDay(
      [{ started_at: "2026-07-08T13:00:00Z", ended_at: null }],
      TZ,
    );
    expect(byDay.size).toBe(0);
  });
});

describe("buildWeeklySeries", () => {
  // 2026-07-08 is a Wednesday; its week runs Mon Jul 6 – Sun Jul 12.
  const TODAY = "2026-07-08";

  it("produces Mon–Sun bars with today marked current", () => {
    const series = buildWeeklySeries(new Map(), TODAY);
    expect(series.bars.map((b) => b.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(series.bars.filter((b) => b.isCurrent).map((b) => b.label)).toEqual([
      "Wed",
    ]);
  });

  it("sums this week's bars and compares against the previous Mon–Sun week", () => {
    const byDay = new Map([
      ["2026-07-06", 600], // this week Mon
      ["2026-07-12", 300], // this week Sun
      ["2026-07-05", 999], // previous week Sun
      ["2026-06-29", 1], // previous week Mon
      ["2026-06-28", 5000], // two weeks back — excluded from both
    ]);
    const series = buildWeeklySeries(byDay, TODAY);
    expect(series.totalSeconds).toBe(900);
    expect(series.previousTotalSeconds).toBe(1000);
    expect(series.deltaPercent).toBe(-10);
  });

  it("returns null delta when the previous week has no time", () => {
    const series = buildWeeklySeries(new Map([["2026-07-06", 600]]), TODAY);
    expect(series.deltaPercent).toBeNull();
  });
});

describe("buildMonthlySeries", () => {
  const TODAY = "2026-07-08"; // July 2026 has 31 days → 5 buckets.

  it("buckets the month into 7-day weeks with today's bucket current", () => {
    const series = buildMonthlySeries(new Map(), TODAY);
    expect(series.bars.map((b) => b.label)).toEqual(["W1", "W2", "W3", "W4", "W5"]);
    // Day 8 falls in W2 (days 8–14).
    expect(series.bars.filter((b) => b.isCurrent).map((b) => b.label)).toEqual([
      "W2",
    ]);
  });

  it("uses 4 buckets for a 28-day month", () => {
    const series = buildMonthlySeries(new Map(), "2027-02-10"); // Feb 2027
    expect(series.bars).toHaveLength(4);
  });

  it("sums buckets and compares against the previous calendar month", () => {
    const byDay = new Map([
      ["2026-07-01", 100], // W1
      ["2026-07-07", 200], // W1 (day 7)
      ["2026-07-08", 400], // W2
      ["2026-07-31", 800], // W5 (day 31)
      ["2026-06-01", 50], // previous month
      ["2026-06-30", 150], // previous month
      ["2026-05-31", 9999], // two months back — excluded
    ]);
    const series = buildMonthlySeries(byDay, TODAY);
    expect(series.bars[0].seconds).toBe(300);
    expect(series.bars[1].seconds).toBe(400);
    expect(series.bars[4].seconds).toBe(800);
    expect(series.totalSeconds).toBe(1500);
    expect(series.previousTotalSeconds).toBe(200);
    expect(series.deltaPercent).toBe(650);
  });
});

describe("buildLearningEffort", () => {
  it("assembles both series from raw rows in the student's timezone", () => {
    // "Now" is Wed Jul 8, 21:00 in New York (Jul 9 01:00 UTC).
    const now = new Date("2026-07-09T01:00:00Z");
    const rows = [
      session("2026-07-09T00:00:00Z", 40), // Jul 8 local — this week, monthly W2
      session("2026-07-01T15:00:00Z", 20), // Jul 1 local — previous week, monthly W1
      { started_at: "2026-07-08T12:00:00Z", ended_at: null }, // dropped
    ];
    const effort = buildLearningEffort(rows, TZ, now);

    expect(effort.weekly.totalSeconds).toBe(40 * 60);
    expect(effort.weekly.previousTotalSeconds).toBe(20 * 60);
    expect(effort.weekly.deltaPercent).toBe(100);

    expect(effort.monthly.totalSeconds).toBe(60 * 60);
    expect(effort.monthly.bars[0].seconds).toBe(20 * 60);
    expect(effort.monthly.bars[1].seconds).toBe(40 * 60);
  });

  it("returns all-zero series with null deltas for a student with no sessions", () => {
    const effort = buildLearningEffort([], TZ, new Date("2026-07-09T01:00:00Z"));
    expect(effort.weekly.totalSeconds).toBe(0);
    expect(effort.weekly.deltaPercent).toBeNull();
    expect(effort.monthly.totalSeconds).toBe(0);
    expect(effort.monthly.deltaPercent).toBeNull();
  });
});

describe("getLearningEffort", () => {
  const NOW = new Date("2026-07-09T01:00:00Z"); // Wed Jul 8, 21:00 in New York

  it("only counts the requesting student's sessions", async () => {
    const mine = session("2026-07-08T15:00:00Z", 30);
    const { client } = createMockSupabaseClient({
      tables: {
        analytics_sessions: {
          rows: [
            { user_id: "student-1", ...mine },
            { user_id: "student-2", ...session("2026-07-08T15:00:00Z", 90) },
          ],
        },
      },
    });

    const effort = await getLearningEffort(client, "student-1", {
      timeZone: TZ,
      now: NOW,
    });
    expect(effort).not.toBeNull();
    expect(effort!.weekly.totalSeconds).toBe(30 * 60);
  });

  it("returns null when the query fails, so the UI can omit the card", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        analytics_sessions: { rows: [], error: { message: "permission denied" } },
      },
    });

    const effort = await getLearningEffort(client, "student-1", {
      timeZone: TZ,
      now: NOW,
    });
    expect(effort).toBeNull();
  });
});
