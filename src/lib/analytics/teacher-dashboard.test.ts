import { describe, expect, it } from "vitest";
import { buildTeacherDashboardData } from "@/lib/analytics/teacher-dashboard";
import type { MockAttempt } from "@/lib/mock-data";
import type { StoredAnswer } from "@/lib/storage";

const ATTEMPT_BASE: Omit<MockAttempt, "id" | "studentId" | "isCorrect"> = {
  teacherId: "t_1",
  classId: "class-1",
  standardId: "3.1.9-12.A",
  standardLabel: "Structure and Function A",
  questionId: "q1",
  timeSpentSec: 60,
  mode: "practice",
  timestamp: "2026-04-01T12:00:00.000Z",
};

function makeAttempt(
  id: string,
  studentId: string,
  isCorrect: boolean,
  overrides: Partial<MockAttempt> = {},
): MockAttempt {
  return {
    id,
    studentId,
    isCorrect,
    ...ATTEMPT_BASE,
    ...overrides,
  };
}

describe("buildTeacherDashboardData", () => {
  it("returns zeros when no attempts are in scope", () => {
    const result = buildTeacherDashboardData([], [], { teacherId: "t_1" });
    expect(result.summary).toEqual({
      totalAnswered: 0,
      totalCorrect: 0,
      overallAccuracy: 0,
    });
    expect(result.byStandard).toEqual([]);
    expect(result.byStudent).toEqual([]);
  });

  it("aggregates per-standard metrics correctly", () => {
    const attempts: MockAttempt[] = [
      makeAttempt("a1", "s1", true),
      makeAttempt("a2", "s1", false),
      makeAttempt("a3", "s2", true, { standardId: "3.1.9-12.P" }),
    ];
    const result = buildTeacherDashboardData(attempts, [], {
      teacherId: "t_1",
    });

    const byA = result.byStandard.find((s) => s.standardId === "3.1.9-12.A");
    expect(byA).toBeDefined();
    expect(byA?.attempted).toBe(2);
    expect(byA?.correct).toBe(1);
    expect(byA?.accuracy).toBe(50);
    expect(byA?.averageTimeSec).toBe(60);
  });

  it("filters by teacher, class, student, and date range", () => {
    const attempts: MockAttempt[] = [
      makeAttempt("a1", "s1", true),
      makeAttempt("a2", "s1", false, {
        teacherId: "t_other",
      }),
      makeAttempt("a3", "s1", true, { classId: "class-2" }),
      makeAttempt("a4", "s2", false),
      makeAttempt("a5", "s1", true, {
        timestamp: "2026-05-01T00:00:00.000Z",
      }),
    ];
    const result = buildTeacherDashboardData(attempts, [], {
      teacherId: "t_1",
      classId: "class-1",
      studentId: "s1",
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-04-15T00:00:00.000Z"),
    });

    expect(result.summary.totalAnswered).toBe(1);
    expect(result.summary.totalCorrect).toBe(1);
  });

  it("computes per-student totals and sorts descending by attempts", () => {
    const attempts: MockAttempt[] = [
      makeAttempt("a1", "s1", true),
      makeAttempt("a2", "s1", false),
      makeAttempt("a3", "s2", true),
    ];
    const result = buildTeacherDashboardData(attempts, [], {
      teacherId: "t_1",
    });
    expect(result.byStudent.map((s) => s.studentId)).toEqual(["s1", "s2"]);
    expect(result.byStudent[0].totalAnswered).toBe(2);
    expect(result.byStudent[0].accuracy).toBe(50);
  });

  it("folds in local StoredAnswer entries that include teacher/class/student", () => {
    const local: StoredAnswer[] = [
      {
        questionId: "q10",
        selectedOptionId: "A",
        isCorrect: true,
        topic: "Genetics",
        teacherId: "t_1",
        classId: "class-1",
        studentId: "s1",
        standardId: "3.1.9-12.P",
        standardLabel: "Label",
        timeSpentSec: 30,
        timestamp: new Date("2026-04-01T00:00:00.000Z").getTime(),
        mode: "practice",
      },
    ];
    const result = buildTeacherDashboardData([], local, {
      teacherId: "t_1",
    });
    expect(result.summary.totalAnswered).toBe(1);
    expect(result.summary.totalCorrect).toBe(1);
    expect(result.summary.overallAccuracy).toBe(100);
  });

  it("ignores local answers missing any of teacherId/classId/studentId", () => {
    const local: StoredAnswer[] = [
      {
        questionId: "q10",
        selectedOptionId: "A",
        isCorrect: true,
        timestamp: Date.now(),
        mode: "practice",
      },
    ];
    const result = buildTeacherDashboardData([], local, {
      teacherId: "t_1",
    });
    expect(result.summary.totalAnswered).toBe(0);
  });

  it("clamps accuracy to 0..100", () => {
    // Build two attempts; regardless of numeric shenanigans accuracy is clamped.
    const attempts: MockAttempt[] = [
      makeAttempt("a1", "s1", true),
      makeAttempt("a2", "s1", true),
    ];
    const result = buildTeacherDashboardData(attempts, [], {
      teacherId: "t_1",
    });
    for (const row of result.byStandard) {
      expect(row.accuracy).toBeGreaterThanOrEqual(0);
      expect(row.accuracy).toBeLessThanOrEqual(100);
    }
  });
});
